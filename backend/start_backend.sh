#!/bin/bash
# Orion Local Backend Launcher
echo "Starting Orion Local Python RAG Backend..."
if [ -d "venv" ]; then
    source venv/bin/activate
fi
PYTHON_BIN=$(command -v python3 || command -v python)
PIP_BIN=$(command -v pip3 || command -v pip)

if [ -z "$PYTHON_BIN" ]; then
    echo "Error: Python 3 is required but not found."
    exit 1
fi

"$PIP_BIN" install -q -r requirements.txt
"$PYTHON_BIN" main.py

