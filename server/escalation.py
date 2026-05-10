import json
from pathlib import Path

URGENCY_ORDER = {"GREEN": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}

# Hardcoded phrases that always escalate to RED before any LLM call
_IMMEDIATE_RED_FLAGS = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "not breathing",
    "stopped breathing",
    "no pulse",
    "unconscious",
    "unresponsive",
    "passed out",
    "won't wake",
    "cardiac arrest",
    "heart attack",
    "throat closing",
    "throat swelling",
    "anaphylaxis",
    "anaphylactic",
    "severe bleeding",
    "spurting blood",
    "stroke",
    "face drooping",
    "slurred speech",
    "convulsions",
    "choking",
]


def check_immediate_escalation(text: str) -> dict | None:
    text_lower = text.lower()
    for phrase in _IMMEDIATE_RED_FLAGS:
        if phrase in text_lower:
            return {"urgency": "RED", "note": f"Red flag detected: '{phrase}'"}
    return None


def check_escalation(text: str, condition_id: str, data_dir: Path) -> dict | None:
    path = data_dir / "questions" / f"{condition_id}.json"
    if not path.exists():
        return None

    questions = json.loads(path.read_text())
    text_lower = text.lower()
    best_urgency: str | None = None
    best_note: str | None = None

    for q in questions.get("ask_next", []):
        for guide in q.get("response_guides", []):
            for phrase in guide.get("if_answer_contains", []):
                if phrase.lower() in text_lower:
                    urgency = guide.get("urgency_escalate")
                    if urgency and (
                        best_urgency is None
                        or URGENCY_ORDER.get(urgency, 0) > URGENCY_ORDER.get(best_urgency, 0)
                    ):
                        best_urgency = urgency
                        best_note = guide.get("note")

    if best_urgency:
        return {"urgency": best_urgency, "note": best_note}
    return None


def max_urgency(a: str | None, b: str | None) -> str:
    if a is None and b is None:
        return "GREEN"
    if a is None:
        return b  # type: ignore[return-value]
    if b is None:
        return a
    return a if URGENCY_ORDER.get(a, 0) >= URGENCY_ORDER.get(b, 0) else b
