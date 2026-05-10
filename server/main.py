import json
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import search as search_module
import escalation as escalation_module
from chat import router as chat_router

DATA_DIR = Path(__file__).parent / "data"
OLLAMA_BASE = "http://localhost:11434"
MODEL = "gemma4:e2b-it-q4_K_M"

_TRIAGE_RED_FLAGS: list[tuple[str, str, str]] = [
    ("chest pain", "Chest pain", "RED"),
    ("not breathing", "Not breathing", "RED"),
    ("stopped breathing", "Breathing stopped", "RED"),
    ("no pulse", "No pulse", "RED"),
    ("unconscious", "Unconscious patient", "RED"),
    ("unresponsive", "Unresponsive patient", "RED"),
    ("severe bleeding", "Severe bleeding", "RED"),
    ("spurting blood", "Arterial bleed", "RED"),
    ("throat closing", "Airway compromise", "RED"),
    ("can't breathe", "Breathing difficulty", "RED"),
    ("cannot breathe", "Breathing difficulty", "RED"),
    ("anaphylaxis", "Anaphylaxis", "RED"),
    ("anaphylactic", "Anaphylactic reaction", "RED"),
    ("choking", "Airway obstruction", "RED"),
    ("cardiac arrest", "Cardiac arrest", "RED"),
    ("heart attack", "Possible cardiac arrest", "RED"),
    ("seizure", "Active seizure", "ORANGE"),
    ("convulsions", "Active convulsions", "ORANGE"),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    search_module.load_conditions(DATA_DIR)
    yield


app = FastAPI(title="MedField API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}


@app.get("/protocols/{condition_id}")
async def get_protocol(condition_id: str):
    path = DATA_DIR / "protocols" / f"{condition_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No protocol found for '{condition_id}'")
    return json.loads(path.read_text())


class TriageRequest(BaseModel):
    message: str
    session_state: dict = {}


@app.post("/triage")
async def triage(req: TriageRequest):
    message_lower = req.message.lower()

    red_flags_found: list[str] = []
    determined_urgency = "GREEN"

    for phrase, label, urgency in _TRIAGE_RED_FLAGS:
        if phrase in message_lower:
            red_flags_found.append(label)
            if escalation_module.URGENCY_ORDER.get(urgency, 0) > escalation_module.URGENCY_ORDER.get(determined_urgency, 0):
                determined_urgency = urgency

    results = search_module.search_conditions(req.message)
    matched_id: str | None = None
    condition_label = "Unknown"

    if results and results[0][1] >= 1.0:
        matched_id = results[0][0]
        cond = search_module.get_condition(matched_id)
        if cond:
            condition_label = cond["name"]
            condition_floor = cond.get("urgency_floor", "GREEN")
            if escalation_module.URGENCY_ORDER.get(condition_floor, 0) > escalation_module.URGENCY_ORDER.get(determined_urgency, 0):
                determined_urgency = condition_floor

    reasoning = f"Matched condition: {condition_label}."
    if red_flags_found:
        reasoning += f" Red flags: {', '.join(red_flags_found)}."
    else:
        reasoning += " No immediate red flags detected in message text."

    return {
        "urgency": determined_urgency,
        "label": condition_label,
        "reasoning": reasoning,
        "red_flags": red_flags_found,
        "matched_condition_id": matched_id,
    }


class SummaryRequest(BaseModel):
    history: list[dict]
    session_state: dict = {}


@app.post("/summary")
async def summary(req: SummaryRequest):
    if not req.history:
        raise HTTPException(status_code=400, detail="No conversation history provided")

    history_text = "\n".join(
        f"{msg['role'].upper()}: {msg['content']}"
        for msg in req.history
        if msg.get("content")
    )

    prompt = f"""Generate a concise medical handoff summary from this wilderness first aid conversation.
The summary will be read aloud to an emergency room doctor or paramedic on arrival.

Include only what is present in the conversation:
- Chief complaint and when it started
- Key symptoms observed
- First aid administered on scene
- Current patient status
- Known allergies or medications if mentioned
- Relevant medical history if mentioned

CONVERSATION:
{history_text}

Write in clear clinical language. Start with "PATIENT SUMMARY:" Keep it under 150 words."""

    async def stream_summary():
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE}/api/generate",
                    json={"model": MODEL, "prompt": prompt, "stream": True},
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        token = chunk.get("response", "")
                        done = chunk.get("done", False)
                        yield json.dumps({"token": token, "done": done}) + "\n"
                        if done:
                            break
            except httpx.ConnectError:
                yield json.dumps({"token": "", "done": True, "error": "Cannot reach Ollama — is it running?"}) + "\n"

    return StreamingResponse(stream_summary(), media_type="application/x-ndjson")
