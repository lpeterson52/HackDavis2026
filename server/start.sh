#!/usr/bin/env bash
set -e

# Ensure Ollama is running
if ! pgrep -x ollama > /dev/null; then
  echo "Starting Ollama..."
  ollama serve &
  sleep 2
fi

# Pull model if not already present
if ! ollama list | grep -q "gemma4:e2b"; then
  echo "Pulling gemma4:e2b (~3 GB)..."
  ollama pull gemma4:e2b
fi

# Install Python deps if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
  pip3 install -r requirements.txt
fi

echo "Starting inference proxy on http://0.0.0.0:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
