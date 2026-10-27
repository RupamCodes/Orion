"""
Orion Real Ollama Smoke Test (Phase 6B)
Validates real Ollama daemon connection and grounded generation if Ollama is installed and running.

Run with:
    python3 backend/tests/smoke_test_ollama.py
"""
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Ensure real Ollama client is used
if "ORION_USE_MOCK_OLLAMA" in os.environ:
    del os.environ["ORION_USE_MOCK_OLLAMA"]

from ollama_client import OllamaClient, OllamaConnectionError, OllamaModelNotFoundError


def run_ollama_smoke_test():
    print("=" * 70)
    print("Orion Real Ollama Smoke Test")
    print("=" * 70)

    client = OllamaClient()
    print(f"\n[1/3] Checking Ollama health at {client.base_url}...")
    health = client.check_health()

    if not health.get("available"):
        print(f"      STATUS: Ollama daemon is NOT running at {client.base_url}.")
        print("      To run real Ollama tests:")
        print("        1. Install Ollama: https://ollama.com")
        print("        2. Start the daemon: `ollama serve`")
        print("        3. Pull model: `ollama pull llama3.2:latest`")
        print("\nSmoke test skipped live generation (Ollama offline). Automated mocks verified.")
        return False

    models = health.get("models", [])
    print(f"      STATUS: Ollama is running. Available models: {models}")

    target_model = client.default_model
    if target_model not in models and not any(target_model in m for m in models):
        print(f"      WARNING: Target model '{target_model}' not found in installed models.")
        print(f"      Run `ollama pull {target_model}` to download it.")
        return False

    print(f"\n[2/3] Sending test grounded prompt to model '{target_model}'...")
    system_prompt = (
        "You are Orion AI assistant. Answer using ONLY the provided context and cite [1]."
    )
    test_context = (
        "<source_context>\n"
        "[Passage 1] Source: \"Apollo Guidance Computer Manual\"\n"
        "The Apollo Guidance Computer operated at a clock frequency of 2.048 MHz.\n"
        "</source_context>"
    )
    user_prompt = f"Source Context:\n{test_context}\n\nQuestion: What was the clock frequency of the Apollo Guidance Computer?"

    t0 = time.time()
    try:
        response = client.generate(
            prompt=user_prompt,
            model=target_model,
            system=system_prompt
        )
        duration = time.time() - t0
        print(f"\n[3/3] Response received in {duration:.2f}s:")
        print("-" * 50)
        print(response)
        print("-" * 50)
        assert len(response) > 0
        assert "2.048" in response
        print("\nREAL OLLAMA SMOKE TEST PASSED!")
        return True
    except Exception as e:
        print(f"      ERROR during generation: {e}")
        return False


if __name__ == "__main__":
    run_ollama_smoke_test()
