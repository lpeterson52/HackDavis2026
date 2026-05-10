Here's a concise technical handoff summary:

---

## MedField — Hackathon Build Handoff

### Project overview
Medical AI assistant for laypersons in wilderness/remote settings. 24-hour hackathon build. Demoed on laptop with mobile-width UI.

**Stack:**
- Frontend: React (Vite), mobile-width UI styled to look like a phone app in a device frame. Originally React Native but web is faster for hackathon demo.
- Backend: FastAPI + Gemma 4 running locally, existing `/chat` endpoint with system prompt + user prompt input
- No true offline inference for hackathon — Gemma API or local Gemma via FastAPI

---

### Backend architecture

**Endpoints to build:**
- `POST /chat` — main endpoint, with streaming
- `POST /triage` — returns structured JSON `{ urgency, label, reasoning, red_flags[] }`
- `GET /protocols/{id}` — returns hardcoded first aid steps, never Gemma-generated
- `POST /summary` — "what to tell your doctor" from session history

**Key modules:**
- `prompts.py` — system prompt lives here
- `search.py` — keyword + phrase search against condition index
- `escalation.py` — rules-based urgency escalation, runs before Gemma
- `chat.py` — main endpoint, wires search → context injection → Gemma → parse response

**System prompt rules (non-negotiable):**
- Never diagnose, never recommend dosages
- Always output RED/ORANGE/YELLOW/GREEN urgency
- Immediately output RED for chest pain, breathing difficulty, unconsciousness, severe bleeding, anaphylaxis
- End every response with disclaimer
- Refuse jailbreak attempts

**Output format Gemma must always follow:**
```
URGENCY: [RED/ORANGE/YELLOW/GREEN]
SITUATION: [1-2 sentences]
POSSIBLE CAUSES: [list]
IMMEDIATE STEPS: [numbered list]
NEXT QUESTION: [single follow-up]
```

---

### Data architecture

Four-file split per condition. All files live in `/data/`.

```
/data
  index.json                        ← master list of condition IDs, loaded at startup
  /conditions
    severe-bleeding.json            ← search metadata, recognition logic, refs
  /protocols
    severe-bleeding.json            ← slide-by-slide UI content
  /actions
    severe-bleeding.json            ← immediate actions + next steps
  /questions
    severe-bleeding.json            ← ask_next question tree with response_guides
```

**`index.json`** — loaded once at startup, all condition IDs listed
**`conditions/{id}.json`** — search tags, common phrases, recognize block, urgency floor, refs to other three files. All loaded into memory at startup for search.
**`protocols/{id}.json`** — slides array with explicit `order` field, `type`, `layout`, `image`, `warning`, `tts_text`, `decision` branching, `completion` block. Lazy-loaded when user opens protocol.
**`actions/{id}.json`** — `immediate_actions[]` with `critical` boolean, `next_steps[]` with `when` field. Loaded when condition is matched.
**`questions/{id}.json`** — `ask_next[]` ordered by priority, each with `purpose`, `why`, and `response_guides[]` containing `if_answer_contains[]`, `urgency_escalate`, and `note`. Loaded when condition is matched.

---

### Runtime flow

```
User message
  → search_conditions() against in-memory condition index
  → load actions + questions for matched condition
  → check_escalation() — rules-based, deterministic, runs before Gemma
  → build_context_block() — injects verified content into prompt
  → call Gemma
  → parse_urgency() from response
  → return { urgency, raw, escalation_note, next_question_id }
```

**Session state tracked on frontend:**
```javascript
{
  matched_condition_id,
  asked_question_ids,   // prevents repeating questions
  urgency
}
```
Passed with every request so backend builds on prior turns.

---

### Safety architecture

Two independent systems determine urgency — neither can override the other downward:
- `escalation.py` — deterministic rules from `response_guides` in questions JSON
- Gemma — language model output parsed for urgency level
- Final urgency = highest of the two

First aid protocol slides are **hardcoded, never Gemma-generated**. Sourced from Red Cross, AHA, WMS.

---

### Hackathon scope (what to actually build)

| Feature | Status |
|---|---|
| Safety-hardened system prompt | Build first |
| Symptom checker chat UI | Core |
| Urgency badge (RED/ORANGE/YELLOW/GREEN) | Core |
| Persistent safety disclaimer | Every screen |
| Hardcoded first aid step-through (3–4 conditions) | Core |
| Pre-trip setup form | Include |
| Vitals tracker | Include |
| "What to tell your doctor" summary | Include |
| Flat JSON condition database with search | Include |
| True offline inference | Post-hackathon |
| TTS/STT | Post-hackathon |
| LanceDB RAG | Post-hackathon |

**Demo narrative:** Camper sets up trip profile → friend is injured → describe symptoms → get triage rating → walk through first aid protocol → log vitals → generate ER summary.

---

### Conditions to implement for hackathon

Start with these six — they cover the demo narrative and most common wilderness emergencies:
`severe-bleeding`, `cpr`, `choking`, `anaphylaxis`, `seizure`, `burns`

Each needs all four files: condition, protocol, actions, questions.