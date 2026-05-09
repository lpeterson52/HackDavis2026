#!/usr/bin/env bash
set -e

# Ensure Ollama is running
if ! pgrep -x ollama > /dev/null; then
  echo "Starting Ollama..."
  ollama serve &
  sleep 2
fi

# Pull model if not already present
if ! ollama list | grep -q "gemma4:e2b-it-q4_K_M"; then
  echo "Pulling gemma4:e2b-it-q4_K_M..."
  ollama pull gemma4:e2b-it-q4_K_M
fi

# Ensure venv is active
VENV_DIR="$(dirname "$0")/.venv"
if [ -z "$VIRTUAL_ENV" ]; then
  if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
  fi
  echo "Activating virtual environment..."
  source "$VENV_DIR/bin/activate"
fi

# Install Python deps if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
  pip install -r requirements.txt
fi

echo "Starting inference proxy on http://0.0.0.0:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
