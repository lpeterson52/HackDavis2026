# Setup & Running Guide

This project has two parts: a local inference server (dev scaffold) and a bare React Native app.

```
HackDavis2026/
├── server/   ← FastAPI proxy in front of Ollama
└── app/      ← Bare React Native app
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| [Ollama](https://ollama.com) | `brew install ollama` |
| Python 3.10+ | `brew install python` |
| Node.js 18+ | `brew install node` |
| Watchman | `brew install watchman` |
| Xcode (iOS) | Mac App Store |
| Android Studio (Android) | [developer.android.com](https://developer.android.com/studio) |

---

## Ollama Setup

Ollama manages downloading and running local models. It must be installed and running before the inference server starts.

### Install

```bash
brew install ollama
```

Or download the Mac app from [ollama.com](https://ollama.com).

### Start the Ollama daemon

```bash
ollama serve
```

By default Ollama only listens on `localhost`. To allow connections from a physical device on your LAN (or from the FastAPI server when testing remotely), set these environment variables before running `ollama serve`:

```bash
export OLLAMA_HOST=0.0.0.0
export OLLAMA_ORIGINS=*
ollama serve
```

To make these permanent, add them to your shell profile (`~/.zshrc` or `~/.bash_profile`).

### Pull the Gemma 4 model

```bash
ollama pull gemma4:e2b   # ~3 GB, edge 2B variant — download once
```

Other available sizes if you have more RAM/VRAM:

| Tag | Params | Notes |
|-----|--------|-------|
| `gemma4:e2b` | 2B | Recommended for development |
| `gemma4:e4b` | 4B | Better quality, ~6 GB |
| `gemma4` | 12B | Full model, needs 16 GB+ RAM |

### Verify Ollama is working

```bash
ollama list                          # should show gemma4:e2b
ollama run gemma4:e2b "Say hi"       # quick smoke test
```

### Useful Ollama commands

```bash
ollama list          # show downloaded models
ollama ps            # show currently loaded models
ollama rm gemma4:e2b # remove a model to free disk space
ollama stop          # shut down the daemon
```

---

## Part 1 — Inference Server

The server runs on your Mac and proxies requests to Ollama. The React Native app talks to it over localhost (simulator) or your LAN IP (physical device).

### First-time setup

```bash
cd server
pip3 install -r requirements.txt
```

### Pull the model (~3 GB, one time only)

```bash
ollama pull gemma4:e2b
```

### Start the server

```bash
# Option A — convenience script (handles Ollama + model check automatically)
cd server
./start.sh

# Option B — manually
ollama serve &          # start Ollama if not already running
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Verify it's working

```bash
# Health check
curl http://localhost:8000/health

# Streaming test (tokens print as they arrive)
curl -X POST http://localhost:8000/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Say hello in one sentence."}' \
  --no-buffer
```

Expected health response:
```json
{"status": "ok", "model": "gemma4:e2b"}
```

Expected streaming output (one JSON object per line):
```
{"token": "Hello", "done": false}
{"token": "!", "done": false}
{"token": "", "done": true}
```

---

## Part 2 — React Native App

### First-time setup

```bash
cd app
npm install

# iOS only
cd ios && pod install && cd ..
```

### Configure the server URL

Open `app/src/inference/OllamaClient.ts` and set `SERVER_URL`:

```ts
// iOS Simulator — localhost works
const SERVER_URL = 'http://localhost:8000';

// Physical device or Android emulator — use your Mac's LAN IP
// Find it with: ipconfig getifaddr en0
const SERVER_URL = 'http://192.168.x.x:8000';
```

> **Tip:** Run `ipconfig getifaddr en0` on your Mac to find its LAN IP.

### Run on iOS Simulator

```bash
cd app
npx react-native run-ios
```

### Run on Android Emulator

```bash
cd app
npx react-native run-android
```

### Run Metro bundler separately (optional)

```bash
cd app
npx react-native start
```

---

## Physical Device — Extra Steps

### iOS

1. Open `app/ios/*.xcworkspace` in Xcode
2. Set your Apple ID under **Signing & Capabilities**
3. Select your device and press **Run**
4. Set `SERVER_URL` to your Mac's LAN IP (see above)

### Android

1. Enable **Developer Options** and **USB Debugging** on the phone
2. Connect via USB
3. Run `npx react-native run-android`
4. Set `SERVER_URL` to your Mac's LAN IP

---

## Offline Testing

The entire inference stack (Ollama + Gemma 4) runs locally. To confirm it works offline:

1. Start the server while connected to the internet
2. Disconnect from Wi-Fi / pull the ethernet
3. Send a prompt from the app — it should still respond

The only network call is the initial `ollama pull gemma4:e2b` to download the model.

---

## Swapping to On-Device Inference (Phase 2)

When ready to run fully on-device with LiteRT-LM (no server needed):

1. Install the native module:
   ```bash
   cd app && npm install react-native-litert-lm
   cd ios && pod install
   ```

2. Download the model from HuggingFace:
   [`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
   Place the `.litertlm` file in `app/assets/`.

3. Implement `app/src/inference/LiteRTClient.ts` (the stub is already there with instructions).

4. In `app/src/inference/index.ts`, change one line:
   ```ts
   // Before
   export { OllamaClient as InferenceClientImpl } from './OllamaClient';

   // After
   export { LiteRTClient as InferenceClientImpl } from './LiteRTClient';
   ```

5. Decommission the `server/` directory — it's no longer needed.

---

## Troubleshooting

**`Cannot reach Ollama`** — Run `ollama serve` before starting the FastAPI server.

**`Network request failed` in the app** — Check `SERVER_URL` in `OllamaClient.ts`. On a physical device it must be the Mac's LAN IP, not `localhost`.

**iOS build fails with pod errors** — Run `cd ios && pod install --repo-update`.

**Android emulator can't reach server** — Use `http://10.0.2.2:8000` instead of `localhost` (Android maps `10.0.2.2` to the host machine).
