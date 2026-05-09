import json
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

OLLAMA_BASE = "http://localhost:11434"
MODEL = "gemma4:e2b"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str
    system: str = ""


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}


@app.post("/generate")
async def generate(req: GenerateRequest):
    payload = {
        "model": MODEL,
        "prompt": req.prompt,
        "stream": True,
    }
    if req.system:
        payload["system"] = req.system

    async def stream_tokens():
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE}/api/generate",
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        error = {"token": "", "done": True, "error": f"Ollama returned {resp.status_code}"}
                        yield json.dumps(error) + "\n"
                        return
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

    return StreamingResponse(stream_tokens(), media_type="application/x-ndjson")
