#!/bin/bash
# Orion Local Backend Launcher
echo "Starting Orion Local Python RAG Backend..."
if [ -d "venv" ]; then
    source venv/bin/activate
fi
pip install -q -r requirements.txt
python main.py
