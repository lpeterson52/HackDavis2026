# Setup & Running Guide

This project has two parts: a local inference server (dev scaffold) and a bare React Native app.

```
HackDavis2026/
├── server/   ← FastAPI proxy in front of Ollama
└── app/      ← Bare React Native app
```

> **iOS note:** iOS builds require a Mac with Xcode. Windows can only target Android.

---

## Prerequisites

### Mac

| Tool | Install |
|------|---------|
| [Ollama](https://ollama.com) | `brew install ollama` |
| Python 3.10+ | `brew install python` |
| Node.js 18+ | `brew install node` |
| Watchman | `brew install watchman` |
| Xcode (iOS) | Mac App Store |
| Android Studio (Android) | [developer.android.com](https://developer.android.com/studio) |

### Windows

| Tool | Install |
|------|---------|
| [Ollama](https://ollama.com) | Download installer from [ollama.com](https://ollama.com) or `winget install Ollama.Ollama` |
| Python 3.10+ | [python.org](https://www.python.org/downloads/) or `winget install Python.Python.3.11` |
| Node.js 18+ | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS` |
| JDK 17 | `winget install Microsoft.OpenJDK.17` |
| Android Studio | [developer.android.com](https://developer.android.com/studio) |

> Watchman is optional on Windows. iOS/Xcode is not available.

---

## Ollama Setup

Ollama manages downloading and running local models. It must be running before the inference server starts.

### Install

#### Mac
```bash
brew install ollama
```
Or download the Mac app from [ollama.com](https://ollama.com).

#### Windows
Download and run the installer from [ollama.com](https://ollama.com). Ollama installs as a background service and adds itself to the system tray — no manual `ollama serve` needed after installation.

---

### Start the Ollama daemon

#### Mac
```bash
ollama serve
```

To allow connections from a physical device on your LAN, set these before running `ollama serve`:

```bash
export OLLAMA_HOST=0.0.0.0
export OLLAMA_ORIGINS=*
ollama serve
```

To make these permanent, add them to `~/.zshrc` or `~/.bash_profile`.

#### Windows
Ollama starts automatically as a Windows service. To allow LAN connections, set the environment variables permanently via PowerShell (run as Administrator):

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "Machine")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "Machine")
```

Then restart the Ollama service from the system tray (right-click → Quit, then relaunch).

To set them only for the current session:

```powershell
$env:OLLAMA_HOST = "0.0.0.0"
$env:OLLAMA_ORIGINS = "*"
ollama serve
```

---

### Pull the Gemma 4 model

The command is the same on both platforms:

```bash
ollama pull gemma4:e2b-it-q4_K_M   # 7.2 GB — instruction-tuned, smallest available
```

Available e2b variants (no sub-7 GB option exists — all e2b tags are 7 GB+):

| Tag | Size | Notes |
|-----|------|-------|
| `gemma4:e2b-it-q4_K_M` | 7.2 GB | **Recommended** — smallest, instruction-tuned, multimodal |
| `gemma4:e2b-it-q8_0` | 8.1 GB | Higher quality, larger |
| `gemma4:e2b-it-bf16` | 10 GB | Full precision, only useful for fine-tuning |
| `gemma4:e2b-mlx-bf16` | 10 GB | Apple MLX format — not for Ollama |
| `gemma4:e2b-mxfp8` | 7.9 GB | NVIDIA GPU format — not for Mac |

> **Note:** "E2B" means 2B *effective* (active) parameters via MoE routing, but the full weight file is 7+ GB because all expert layers must be stored. A smaller on-device footprint requires the LiteRT-LM `.litertlm` export (see Phase 2).

### Verify Ollama is working

```bash
ollama list                                    # should show gemma4:e2b-it-q4_K_M
ollama run gemma4:e2b-it-q4_K_M "Say hi"      # quick smoke test
```

### Useful Ollama commands

```bash
ollama list          # show downloaded models
ollama ps            # show currently loaded models
ollama rm gemma4:e2b-it-q4_K_M   # remove a model to free disk space
ollama stop          # shut down the daemon (Mac only)
```

---

## Part 1 — Inference Server

The server runs on your machine and proxies requests to Ollama. The React Native app connects over localhost (emulator) or your LAN IP (physical device).

### First-time setup

#### Mac
```bash
cd server
./start.sh   # creates .venv, installs deps, starts uvicorn
```

#### Windows
```powershell
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Start the server

#### Mac
```bash
cd server
./start.sh
```

#### Windows
```powershell
cd server
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

> On Windows, `start.sh` requires Git Bash or WSL to run. The manual steps above are recommended instead.

### Verify it's working

```bash
# Health check
curl http://localhost:8000/health

# Streaming test (tokens print as they arrive)
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"Say hello in one sentence.\"}" \
  --no-buffer
```

> `curl` is available in Windows 10+ via Command Prompt and PowerShell. Use double quotes and escape inner quotes as shown above.

Expected health response:
```json
{"status": "ok", "model": "gemma4:e2b-it-q4_K_M"}
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
```

#### Mac — iOS only
```bash
cd ios && pod install && cd ..
```

### Configure the server URL

Open `app/src/inference/OllamaClient.ts` and set `SERVER_URL`:

```ts
// Emulator (both platforms) — localhost works
const SERVER_URL = 'http://localhost:8000';

// Physical device — use your machine's LAN IP
const SERVER_URL = 'http://192.168.x.x:8000';
```

#### Find your LAN IP

**Mac:**
```bash
ipconfig getifaddr en0
```

**Windows:**
```powershell
ipconfig   # look for "IPv4 Address" under your active adapter
```

### Run on iOS Simulator (Mac only)

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

### iOS (Mac only)

1. Open `app/ios/*.xcworkspace` in Xcode
2. Set your Apple ID under **Signing & Capabilities**
3. Select your device and press **Run**
4. Set `SERVER_URL` to your Mac's LAN IP

### Android (Mac or Windows)

1. Enable **Developer Options** and **USB Debugging** on the phone
2. Connect via USB
3. Run `npx react-native run-android`
4. Set `SERVER_URL` to your machine's LAN IP

---

## Offline Testing

The entire inference stack (Ollama + Gemma 4) runs locally. To confirm it works offline:

1. Start the server while connected to the internet
2. Disconnect from Wi-Fi / pull the ethernet
3. Send a prompt from the app — it should still respond

The only network call is the initial `ollama pull gemma4:e2b-it-q4_K_M` to download the model.

---

## Swapping to On-Device Inference (Phase 2)

When ready to run fully on-device with LiteRT-LM (no server needed):

1. Install the native module:
   ```bash
   cd app && npm install react-native-litert-lm
   cd ios && pod install   # Mac/iOS only
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

**`Cannot reach Ollama`** — On Mac, run `ollama serve`. On Windows, check the system tray to confirm Ollama is running.

**`Network request failed` in the app** — Check `SERVER_URL` in `OllamaClient.ts`. On a physical device it must be the machine's LAN IP, not `localhost`.

**Android emulator can't reach server** — Use `http://10.0.2.2:8000` instead of `localhost` (Android maps `10.0.2.2` to the host machine).

**iOS build fails with pod errors** — Run `cd ios && pod install --repo-update` (Mac only).

**Windows: `.venv\Scripts\activate` is blocked** — PowerShell execution policy may be restricting scripts. Run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Windows: `python` not found** — Ensure Python was added to PATH during install. Re-run the installer and check "Add Python to PATH", or use `py` instead of `python`.
