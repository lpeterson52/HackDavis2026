import json
import re
from pathlib import Path

_conditions: dict[str, dict] = {}


def load_conditions(data_dir: Path) -> None:
    index = json.loads((data_dir / "index.json").read_text())
    for cid in index["conditions"]:
        path = data_dir / "conditions" / f"{cid}.json"
        if path.exists():
            _conditions[cid] = json.loads(path.read_text())


def search_conditions(text: str) -> list[tuple[str, float]]:
    text_lower = text.lower()
    scores: dict[str, float] = {}

    for cid, cond in _conditions.items():
        score = 0.0
        for phrase in cond.get("common_phrases", []):
            if phrase.lower() in text_lower:
                score += 3.0
        for tag in cond.get("search_tags", []):
            pattern = r"\b" + re.escape(tag.lower()) + r"\w*"
            if re.search(pattern, text_lower):
                score += 1.0
        if score > 0:
            scores[cid] = score

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def get_condition(cid: str) -> dict | None:
    return _conditions.get(cid)


def get_all_conditions() -> dict[str, dict]:
    return dict(_conditions)
