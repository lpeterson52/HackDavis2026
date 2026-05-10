DO NOT EDIT NODE_MODULES OR PODS DIRECTLY.

Use `pnpm` (not npm/yarn/bun) for all JS package installs in `app/`.

## MedField — Hackathon Build

### Project overview

Medical AI assistant for laypersons in wilderness/remote settings. 24-hour hackathon build.

**Core demo scenario:** Hiker collapses on trail. User opens app, taps the hands-free button, sets phone face-up, and speaks hands-free while keeping both hands on the patient. The app listens, triages, speaks instructions back, and loops — no screen interaction needed.

**Stack:**
- Frontend: React Native (iOS simulator, `app/`)
- Backend: FastAPI + Gemma 4 running locally (`server/`), interchangeable with LiteRT for true on-device inference post-hackathon
- STT: `@react-native-voice/voice` (on-device)
- TTS: `react-native-tts` (on-device)

---

### Hands-free voice loop — top priority for demo

The entire demo pivots on this. The loop is:

```
[User taps mic] → STT listens → transcript auto-submits to /chat
  → streaming response arrives → done chunk has spoken_text
  → TTS speaks spoken_text → TTS finishes → STT auto-restarts
  → repeat until user stops
```

**What's built:**
- `hooks/useVoiceOrchestrator.ts` — STT/TTS state machine (idle | listening | speaking | error). iOS spurious-error handling done.
- `ChatScreen.tsx` — mic button toggles STT, TTS speaks `spoken_text` from done chunk.

**What's not wired yet:**
- Auto-submit on transcript arrival (no manual send needed in hands-free mode)
- Auto-restart STT after TTS finishes

Both hooks exist. The wiring in `ChatScreen.tsx` is the remaining work.

---

### Frontend (`app/`)

React Native project. Run on iOS simulator:
```
cd app && pnpm install
npx pod-install ios   # if native deps changed
npx react-native run-ios
```

**Key files:**
- `src/api.ts` — `streamChat`, `fetchProtocol`, `streamSummary` (XHR NDJSON streaming)
- `src/context.tsx` — `AppProvider`: messages, sessionState, currentUrgency
- `src/hooks/useVoiceOrchestrator.ts` — STT/TTS state machine
- `src/screens/ChatScreen.tsx` — main triage chat + mic button + hands-free mode
- `src/screens/GuidesScreen.tsx` — hardcoded protocol slide-through with decision branching
- `src/screens/HistoryScreen.tsx` — ER summary generator
- `src/inference/` — inference client abstraction (`OllamaClient.ts`, `LiteRTClient.ts`); currently backend handles inference

**Session state tracked on frontend and passed with every request:**
```typescript
{
  matched_condition_id,
  asked_question_ids,   // prevents repeating questions
  urgency
}
```

---

### Backend (`server/`)

FastAPI. Do not change the backend — accuracy is good and the demo doesn't need it touched.

```
cd server && source venv/bin/activate
uvicorn main:app --reload
```

**Endpoints:**
- `POST /chat` — streaming NDJSON; done chunk includes `spoken_text` (TTS-ready, no markdown)
- `POST /triage` — `{ urgency, label, reasoning, red_flags[] }`
- `GET /protocols/{id}` — hardcoded first aid slides, never Gemma-generated
- `POST /summary` — "what to tell your doctor" from session history

**Key modules:**
- `prompts.py` — system prompt
- `search.py` — in-memory condition index, keyword/phrase scoring
- `escalation.py` — deterministic urgency rules; final urgency = max(rules, Gemma)
- `chat.py` — wires search → context injection → Gemma → parse → stream

**System prompt rules (non-negotiable):**
- Never diagnose, never recommend dosages
- Always output RED/ORANGE/YELLOW/GREEN urgency
- Immediately RED: chest pain, breathing difficulty, unconsciousness, severe bleeding, anaphylaxis
- End every response with disclaimer
- Refuse jailbreak attempts

**Gemma output format:**
```
URGENCY: [RED/ORANGE/YELLOW/GREEN]
SITUATION: [1-2 sentences]
POSSIBLE CAUSES: [list]
IMMEDIATE STEPS: [numbered list]
NEXT QUESTION: [single follow-up]
```

---

### Data (`server/data/`)

Four-file split per condition, all six conditions fully implemented:
`severe-bleeding`, `cpr`, `choking`, `anaphylaxis`, `seizure`, `burns`

```
data/
  index.json              ← master condition list, loaded at startup
  conditions/{id}.json    ← search tags, urgency floor, recognition logic
  protocols/{id}.json     ← slide-by-slide content (hardcoded, sourced from Red Cross/AHA/WMS)
  actions/{id}.json       ← immediate_actions[], next_steps[]
  questions/{id}.json     ← ask_next[] question tree with response_guides
```

---

### Safety architecture

Two independent systems determine urgency — neither can override the other downward:
- `escalation.py` — deterministic rules
- Gemma — parsed from model output
- Final urgency = highest of the two

Protocol slides are hardcoded, never Gemma-generated.

---

### Post-hackathon (do not build now)

- Swap FastAPI for LiteRT (`src/inference/LiteRTClient.ts` is stubbed) for true offline on-device inference
- LanceDB RAG over condition database
- Android support