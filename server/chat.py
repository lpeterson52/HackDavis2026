import json
import re
from pathlib import Path

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import search as search_module
import escalation as escalation_module
from prompts import (
    SYSTEM_PROMPT,
    CLASSIFICATION_PROMPT,
    SPOKEN_PROMPT,
    HARDCODED_RED_RESPONSES,
    CATEGORY_TO_CONDITION_ID,
    build_context_block,
    build_prompt,
    build_spoken_context,
)

router = APIRouter()

DATA_DIR = Path(__file__).parent / "data"
OLLAMA_BASE = "http://localhost:11434"
MODEL = "gemma4:e2b-it-q4_K_M"


class SessionState(BaseModel):
    matched_condition_id: str | None = None
    asked_question_ids: list[str] = []
    urgency: str | None = None
    facts: dict[str, str] = {}
    symptoms: list[str] = []
    called_911: bool = False


class HistoryMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_state: SessionState = SessionState()
    history: list[HistoryMessage] = []


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def _parse_urgency(text: str) -> str | None:
    if "🔴" in text:
        return "RED"
    if "🟠" in text:
        return "ORANGE"
    if "🟡" in text:
        return "YELLOW"
    if "🟢" in text:
        return "GREEN"
    m = re.search(r"URGENCY:\s*(RED|ORANGE|YELLOW|GREEN)", text, re.IGNORECASE)
    return m.group(1).upper() if m else None


def _pick_next_question(questions: dict, asked_ids: list[str]) -> dict | None:
    candidates = [q for q in questions.get("ask_next", []) if q["id"] not in asked_ids]
    return min(candidates, key=lambda q: q["priority"]) if candidates else None


async def _call_classification(client: httpx.AsyncClient, user_message: str) -> dict | None:
    messages = [
        {"role": "system", "content": CLASSIFICATION_PROMPT},
        {"role": "user", "content": user_message},
    ]
    try:
        resp = await client.post(
            f"{OLLAMA_BASE}/api/chat",
            json={"model": MODEL, "messages": messages, "stream": False,
                  "options": {"temperature": 0, "num_predict": 150}},
            timeout=15.0,
        )
        if resp.status_code != 200:
            return None
        raw = resp.json().get("message", {}).get("content", "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception:
        return None


@router.post("/chat")
async def chat(req: ChatRequest):
    # 1. Match condition (keep prior match; upgrade if new message scores higher)
    results = search_module.search_conditions(req.message)
    matched_id = req.session_state.matched_condition_id
    if results and results[0][1] >= 1.0:
        matched_id = results[0][0]

    # 2. Load context data for matched condition
    condition = search_module.get_condition(matched_id) if matched_id else None
    actions = _load_json(DATA_DIR / "actions" / f"{matched_id}.json") if matched_id else {}
    questions_data = _load_json(DATA_DIR / "questions" / f"{matched_id}.json") if matched_id else {}
    next_question = _pick_next_question(questions_data, req.session_state.asked_question_ids)

    # 3. Determine urgency floor
    floor_urgency: str | None = condition.get("urgency_floor") if condition else None

    immediate = escalation_module.check_immediate_escalation(req.message)
    if immediate:
        floor_urgency = escalation_module.max_urgency(floor_urgency, immediate["urgency"])

    cond_escalation = None
    if matched_id:
        cond_escalation = escalation_module.check_escalation(req.message, matched_id, DATA_DIR)
        if cond_escalation:
            floor_urgency = escalation_module.max_urgency(floor_urgency, cond_escalation["urgency"])

    escalation_note = (immediate or cond_escalation or {}).get("note")

    # 4. Extract new facts from the user's answer to the last asked question
    last_asked_id = req.session_state.asked_question_ids[-1] if req.session_state.asked_question_ids else None
    new_facts: dict[str, str] = {}
    if matched_id and last_asked_id:
        new_facts = escalation_module.extract_facts(req.message, matched_id, DATA_DIR, last_asked_id)

    # Merge with accumulated facts for this turn's context
    all_facts = {**req.session_state.facts, **new_facts}

    # Append current message to symptom log
    updated_symptoms = req.session_state.symptoms + [req.message]

    context_block = build_context_block(
        condition or {}, actions, questions_data, req.session_state.asked_question_ids, last_asked_id,
        all_facts or None,
        updated_symptoms,
        req.session_state.called_911,
    )
    current_user_content = build_prompt(req.message, context_block, floor_urgency)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in req.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": current_user_content})

    # 5. Two-stage inference: classify → spoken response (or hardcoded for RED)
    spoken_text_accumulator: list[str] = []

    async def stream():
        nonlocal matched_id

        async with httpx.AsyncClient(timeout=None) as client:

            # Call 1 — classification (temp=0, JSON, non-streaming)
            classification: dict | None = None
            try:
                classification = await _call_classification(client, req.message)
            except Exception:
                pass

            category: str = "UNKNOWN"
            clf_urgency: str | None = None
            confidence: str = "LOW"
            clarifying_question: str | None = None

            if classification and all(k in classification for k in ("category", "urgency", "confidence")):
                category = classification.get("category", "UNKNOWN")
                clf_urgency = classification.get("urgency")
                confidence = classification.get("confidence", "LOW")
                clarifying_question = classification.get("clarifying_question")
                if matched_id is None and category != "UNKNOWN":
                    matched_id = CATEGORY_TO_CONDITION_ID.get(category)
            else:
                classification = None  # signal fallback path

            clf_urgency_resolved = escalation_module.max_urgency(floor_urgency, clf_urgency)
            use_hardcoded = clf_urgency_resolved == "RED"
            use_clarifying = (confidence == "LOW") and (clarifying_question is not None) and not use_hardcoded

            if classification is None:
                # Fallback: original single-call with SYSTEM_PROMPT
                try:
                    async with client.stream(
                        "POST", f"{OLLAMA_BASE}/api/chat",
                        json={"model": MODEL, "messages": messages, "stream": True},
                    ) as resp:
                        if resp.status_code != 200:
                            yield json.dumps({"token": "", "done": True, "error": f"Ollama error {resp.status_code}"}) + "\n"
                            return
                        async for line in resp.aiter_lines():
                            if not line:
                                continue
                            try:
                                chunk = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            token = chunk.get("message", {}).get("content", "")
                            spoken_text_accumulator.append(token)
                            yield json.dumps({"token": token, "done": False}) + "\n"
                            if chunk.get("done", False):
                                break
                except httpx.ConnectError:
                    yield json.dumps({"token": "", "done": True, "error": "Cannot reach Ollama — is it running?"}) + "\n"
                    return

            elif use_hardcoded:
                spoken = HARDCODED_RED_RESPONSES.get(category, HARDCODED_RED_RESPONSES["UNKNOWN"])
                spoken_text_accumulator.append(spoken)
                yield json.dumps({"token": spoken, "done": False}) + "\n"

            elif use_clarifying:
                spoken_text_accumulator.append(clarifying_question)
                yield json.dumps({"token": clarifying_question, "done": False}) + "\n"

            else:
                # Call 2 — spoken response (streaming, 1-2 sentences)
                spoken_ctx = build_spoken_context(
                    category, clf_urgency_resolved or "GREEN", req.message,
                    facts=all_facts or None, symptoms=updated_symptoms,
                    called_911=req.session_state.called_911,
                )
                spoken_messages = [
                    {"role": "system", "content": SPOKEN_PROMPT},
                    {"role": "user", "content": spoken_ctx},
                ]
                try:
                    async with client.stream(
                        "POST", f"{OLLAMA_BASE}/api/chat",
                        json={"model": MODEL, "messages": spoken_messages, "stream": True,
                              "options": {"temperature": 0.3, "num_predict": 80}},
                    ) as resp:
                        if resp.status_code != 200:
                            fallback = HARDCODED_RED_RESPONSES["UNKNOWN"]
                            spoken_text_accumulator.append(fallback)
                            yield json.dumps({"token": fallback, "done": False}) + "\n"
                        else:
                            async for line in resp.aiter_lines():
                                if not line:
                                    continue
                                try:
                                    chunk = json.loads(line)
                                except json.JSONDecodeError:
                                    continue
                                token = chunk.get("message", {}).get("content", "")
                                spoken_text_accumulator.append(token)
                                yield json.dumps({"token": token, "done": False}) + "\n"
                                if chunk.get("done", False):
                                    break
                except httpx.ConnectError:
                    yield json.dumps({"token": "", "done": True, "error": "Cannot reach Ollama — is it running?"}) + "\n"
                    return

        full_text = "".join(spoken_text_accumulator)
        gemma_urgency = _parse_urgency(full_text)
        final_urgency = escalation_module.max_urgency(clf_urgency_resolved, gemma_urgency)
        called_911_updated = req.session_state.called_911 or (final_urgency == "RED")

        yield json.dumps({
            "token": "",
            "done": True,
            "urgency": final_urgency,
            "matched_condition_id": matched_id,
            "escalation_note": escalation_note,
            "next_question_id": next_question["id"] if next_question else None,
            "new_facts": new_facts,
            "symptoms": updated_symptoms,
            "called_911": called_911_updated,
            "classification": classification,
            "spoken_text": full_text.strip(),
        }) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")
