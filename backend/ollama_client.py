"""
Orion Local Ollama Client
Provides robust HTTP communication with local Ollama daemon.
Includes timeout handling, error mapping (503 unavailable, 404 missing model, 504 timeout),
and a deterministic MockOllamaClient for offline automated test suites.
"""
import os
import json
import logging
from typing import Optional, Dict, Any, List, Union, Callable
import httpx

logger = logging.getLogger(__name__)

DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2:latest"
DEFAULT_OLLAMA_TIMEOUT = 60.0


class OllamaError(Exception):
    """Base exception for Ollama client errors."""
    pass


class OllamaConnectionError(OllamaError):
    """Raised when Ollama daemon cannot be reached."""
    pass


class OllamaModelNotFoundError(OllamaError):
    """Raised when requested model is not installed in local Ollama."""
    pass


class OllamaTimeoutError(OllamaError):
    """Raised when request to Ollama times out."""
    pass


class OllamaResponseError(OllamaError):
    """Raised when Ollama returns an unexpected HTTP error."""
    pass


class OllamaClient:
    """
    Client for interacting with local Ollama REST API.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        default_model: Optional[str] = None
    ):
        self.base_url = (
            base_url
            or os.environ.get("ORION_OLLAMA_URL")
            or DEFAULT_OLLAMA_URL
        ).rstrip("/")
        self.timeout = (
            timeout
            if timeout is not None
            else float(os.environ.get("ORION_OLLAMA_TIMEOUT", DEFAULT_OLLAMA_TIMEOUT))
        )
        self.default_model = (
            default_model
            or os.environ.get("ORION_OLLAMA_MODEL")
            or DEFAULT_OLLAMA_MODEL
        )

    def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        system: Optional[str] = None,
        temperature: float = 0.2,
        top_p: float = 0.9,
        format: Optional[str] = None,
    ) -> str:
        """
        Sends prompt to local Ollama and returns generated text.
        """
        target_model = model or self.default_model
        endpoint = f"{self.base_url}/api/generate"

        payload: Dict[str, Any] = {
            "model": target_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "top_p": top_p,
            }
        }
        if system:
            payload["system"] = system
        if format:
            payload["format"] = format

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(endpoint, json=payload)
        except httpx.ConnectError as e:
            logger.warning(f"Could not connect to Ollama at {self.base_url}: {e}")
            raise OllamaConnectionError(
                f"Ollama service is unavailable at {self.base_url}. "
                "Please ensure Ollama is installed and running (`ollama serve`)."
            ) from e
        except httpx.TimeoutException as e:
            logger.warning(f"Ollama request timed out after {self.timeout}s: {e}")
            raise OllamaTimeoutError(
                f"Request to Ollama timed out after {self.timeout} seconds."
            ) from e
        except Exception as e:
            logger.warning(f"Ollama unexpected network error: {e}")
            raise OllamaConnectionError(
                f"Network error while connecting to Ollama: {e}"
            ) from e

        if res.status_code == 404:
            raise OllamaModelNotFoundError(
                f"Ollama model '{target_model}' was not found. "
                f"Please pull the model using `ollama pull {target_model}`."
            )

        if not res.is_success:
            raise OllamaResponseError(
                f"Ollama returned error status {res.status_code}: {res.text}"
            )

        try:
            data = res.json()
            return data.get("response", "").strip()
        except Exception as e:
            raise OllamaResponseError(f"Failed to parse Ollama JSON response: {e}") from e

    def check_health(self) -> Dict[str, Any]:
        """
        Checks if Ollama is running and lists local models.
        """
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.is_success:
                    models = [m.get("name", "") for m in res.json().get("models", [])]
                    return {"available": True, "models": models}
        except Exception:
            pass
        return {"available": False, "models": []}


class MockOllamaClient(OllamaClient):
    """
    Deterministic offline mock Ollama client for automated testing.
    Never initiates HTTP network requests.
    Supports injecting specific answers, tool-specific responses, callable generators, or error simulations.
    """

    def __init__(
        self,
        simulated_response: Optional[Union[str, Dict[str, Any], Callable[[str, Optional[str]], str]]] = None,
        simulate_error: Optional[str] = None,  # "connection", "timeout", "model_not_found", "malformed_json"
        auto_studio_responses: bool = False,
    ):
        super().__init__(base_url="http://mock-ollama:11434", timeout=5.0)
        self.simulated_response = simulated_response
        self.simulate_error = simulate_error
        self.auto_studio_responses = auto_studio_responses
        self.last_prompt: Optional[str] = None
        self.last_system: Optional[str] = None
        self.last_model: Optional[str] = None

    @classmethod
    def get_studio_sample_response(cls, tool_type: str, is_regeneration: bool = False) -> str:
        """Returns valid structured JSON for a given studio tool type."""
        clean = (tool_type or "").strip().lower()
        if clean in ("flashcards", "flashcard"):
            return json.dumps({
                "title": "LLM Generated Flashcard Deck",
                "cards": [
                    {
                        "question": "What is Direct Memory Access (DMA)?",
                        "answer": "DMA allows hardware devices to transfer data to and from memory without CPU intervention.",
                        "category": "OS Architecture",
                        "citation_index": 1
                    },
                    {
                        "question": "What is the purpose of cache coherence protocols?",
                        "answer": "Snooping and directory protocols ensure uniform memory states across multi-core processors.",
                        "category": "Cache Coherence",
                        "citation_index": 1
                    },
                    {
                        "question": "How does the NVMe protocol scale concurrent storage queues?",
                        "answer": "NVMe supports up to 64,000 queues each with 64,000 commands.",
                        "category": "Storage Architecture",
                        "citation_index": 2
                    }
                ]
            })
        elif clean in ("mindmap", "mind_map"):
            return json.dumps({
                "title": "LLM Concept Mind Map",
                "root_id": "node-root",
                "nodes": [
                    {
                        "id": "node-root",
                        "label": "Operating Systems Architecture",
                        "description": "Central architecture overview",
                        "category": "Root",
                        "citation_index": 1
                    },
                    {
                        "id": "node-dma",
                        "label": "Direct Memory Access",
                        "description": "Hardware subsystems bypass CPU for main memory access",
                        "category": "Memory",
                        "citation_index": 1
                    },
                    {
                        "id": "node-cache",
                        "label": "Cache Coherence",
                        "description": "Snooping and directory protocols for multi-core",
                        "category": "Cache",
                        "citation_index": 1
                    },
                    {
                        "id": "node-nvme",
                        "label": "NVMe Queuing",
                        "description": "High-depth storage queues",
                        "category": "Storage",
                        "citation_index": 2
                    }
                ],
                "edges": [
                    {
                        "from": "node-root",
                        "to": "node-dma",
                        "label": "accelerates"
                    },
                    {
                        "from": "node-root",
                        "to": "node-cache",
                        "label": "coordinates"
                    },
                    {
                        "from": "node-root",
                        "to": "node-nvme",
                        "label": "manages"
                    }
                ]
            })
        elif clean in ("report", "reports"):
            return json.dumps({
                "title": "LLM Executive Report: Modern Systems Architecture",
                "summary": "This report synthesizes modern OS memory mechanisms and NVMe protocol architectures [1].",
                "key_findings": [
                    "Direct Memory Access significantly reduces host processor workload [1].",
                    "NVMe concurrent queues eliminate legacy SATA controller bottlenecks [2]."
                ],
                "sections": [
                    {
                        "heading": "Memory Architecture and DMA",
                        "content": "DMA empowers high-speed peripheral subsystems to write directly to RAM [1].",
                        "key_takeaways": ["Minimizes CPU cycle consumption during bulk data transfers"]
                    },
                    {
                        "heading": "High-Throughput Storage Subsystems",
                        "content": "NVMe queue depth enables massive parallelism across multi-lane PCIe interconnects [2].",
                        "key_takeaways": ["Supports enterprise I/O scalability"]
                    }
                ],
                "inferences_and_strategic_notes": "Hardware offloading architectures remain critical for high-bandwidth NVMe pipelines."
            })
        elif clean in ("infographic", "infographics"):
            return json.dumps({
                "title": "LLM Visual Infographic: Systems At Scale",
                "subtitle": "Synthesizing core memory and storage operational metrics",
                "theme": "emerald",
                "stats": [
                    {
                        "label": "Memory Latency",
                        "value": "Zero-CPU Load",
                        "context": "DMA executes direct transfers to main memory",
                        "source_ref": "[1]"
                    },
                    {
                        "label": "Queue Capacity",
                        "value": "64,000 Queues",
                        "context": "NVMe concurrent queue capacity limit",
                        "source_ref": "[2]"
                    }
                ],
                "key_takeaways": [
                    "Virtual paging translation is accelerated by the Translation Lookaside Buffer [1].",
                    "Deadline schedulers prevent request starvation in multi-tenant workloads [2]."
                ],
                "process_steps": [
                    {
                        "step": 1,
                        "title": "Page Translation",
                        "description": "TLB lookup translates virtual address to physical frame [1]"
                    },
                    {
                        "step": 2,
                        "title": "DMA Direct Transfer",
                        "description": "Hardware controller streams data directly to main memory [1]"
                    }
                ],
                "comparison_points": [
                    {
                        "feature": "Command Queuing",
                        "side_a": "Legacy SATA: Single queue 32 commands",
                        "side_b": "NVMe: 64K queues each 64K commands"
                    }
                ]
            })
        elif clean in ("audio_overview", "podcast"):
            if is_regeneration:
                return json.dumps({
                    "title": "LLM Audio Discussion: Advanced System Dynamics",
                    "dialogue": [
                        {
                            "speaker": "Host A (Alex)",
                            "text": "Sam, let's take a fresh look at this today—how do operating systems handle concurrent load spikes?"
                        },
                        {
                            "speaker": "Host B (Sam)",
                            "text": "That is the critical point from our latest review. The architectural design shows parallel queuing eliminates legacy SATA bottlenecks."
                        },
                        {
                            "speaker": "Host A (Alex)",
                            "text": "So rather than serializing every I/O transaction, hardware controllers route requests across dedicated channels?"
                        },
                        {
                            "speaker": "Host B (Sam)",
                            "text": "Exactly. Multi-queue protocols and cache-aware scheduling keep latency predictable across sustained workloads."
                        }
                    ]
                })
            return json.dumps({
                "title": "LLM Audio Discussion: OS & Storage Deep Dive",
                "dialogue": [
                    {
                        "speaker": "Host A (Alex)",
                        "text": "Welcome to Orion Studio! Today we are looking at how modern operating systems coordinate memory and storage."
                    },
                    {
                        "speaker": "Host B (Sam)",
                        "text": "That is right Alex. What stands out right away from the documents is how DMA prevents the CPU from being bottlenecked during transfers."
                    },
                    {
                        "speaker": "Host A (Alex)",
                        "text": "And that ties directly into NVMe storage architecture, which provides up to sixty-four thousand queues."
                    },
                    {
                        "speaker": "Host B (Sam)",
                        "text": "Exactly. Multi-core systems need both cache coherence and massive parallel queues to keep up with modern workloads."
                    }
                ]
            })
        else:
            return "{}"




    def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        system: Optional[str] = None,
        temperature: float = 0.2,
        top_p: float = 0.9,
        format: Optional[str] = None,
    ) -> str:
        self.last_prompt = prompt
        self.last_system = system
        self.last_model = model or self.default_model

        if self.simulate_error == "connection":
            raise OllamaConnectionError(
                f"Ollama service is unavailable at {self.base_url}. "
                "Please ensure Ollama is installed and running (`ollama serve`)."
            )
        elif self.simulate_error == "timeout":
            raise OllamaTimeoutError(
                f"Request to Ollama timed out after {self.timeout} seconds."
            )
        elif self.simulate_error == "model_not_found":
            raise OllamaModelNotFoundError(
                f"Ollama model '{self.last_model}' was not found. "
                f"Please pull the model using `ollama pull {self.last_model}`."
            )
        elif self.simulate_error == "malformed_json":
            return "```json\n{ \"invalid_json\": [ unclosed string and missing brace\n"

        if self.simulated_response is not None:
            if callable(self.simulated_response):
                return self.simulated_response(prompt, system)
            elif isinstance(self.simulated_response, dict):
                return json.dumps(self.simulated_response)
            return str(self.simulated_response)

        if self.auto_studio_responses:
            sys_text = (system or "").lower()
            prompt_text = (prompt or "").lower()
            is_regen = "regeneration" in sys_text or "regeneration" in prompt_text or "regenerat" in prompt_text
            if "flashcard" in sys_text:
                return self.get_studio_sample_response("flashcards", is_regeneration=is_regen)
            elif "concept mapping" in sys_text or "mind map" in sys_text:
                return self.get_studio_sample_response("mindmap", is_regeneration=is_regen)
            elif "executive research analyst" in sys_text or "research report" in sys_text:
                return self.get_studio_sample_response("report", is_regeneration=is_regen)
            elif "visual data journalist" in sys_text or "infographic" in sys_text:
                return self.get_studio_sample_response("infographic", is_regeneration=is_regen)
            elif "podcast producer" in sys_text or "dialogue" in sys_text:
                return self.get_studio_sample_response("audio_overview", is_regeneration=is_regen)


        # Default smart mock: extract passages and generate grounded answer with citations
        return (
            f"Based on the provided research documents, the core findings confirm that "
            f"operational parameters operate in accordance with documented principles [1]. "
            f"Furthermore, supporting evidence reinforces these findings across key metrics [2]."
        )

    def check_health(self) -> Dict[str, Any]:
        if self.simulate_error == "connection":
            return {"available": False, "models": []}
        return {"available": True, "models": ["llama3.2:latest", "mistral:latest"]}


_default_ollama_client: Optional[OllamaClient] = None


def get_ollama_client() -> OllamaClient:
    """
    Returns active OllamaClient instance.
    Uses MockOllamaClient if ORION_USE_MOCK_OLLAMA is set to '1' and no custom client has been set.
    """
    global _default_ollama_client
    if _default_ollama_client is not None:
        return _default_ollama_client
    if os.environ.get("ORION_USE_MOCK_OLLAMA") == "1":
        _default_ollama_client = MockOllamaClient()
        return _default_ollama_client
    _default_ollama_client = OllamaClient()
    return _default_ollama_client


def set_ollama_client(client: Optional[OllamaClient]):
    """
    Allows test harness to inject mock client.
    """
    global _default_ollama_client
    _default_ollama_client = client
