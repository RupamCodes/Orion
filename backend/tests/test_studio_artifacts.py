"""
Test Studio Artifacts Engine and Endpoints (Phase 8 Unit & Integration Suite)
Validates:
1. Artifact CRUD and strict notebook isolation.
2. Source-scoped generation for all 5 tools:
   - Flashcards
   - Mind Map
   - Reports
   - Infographic
   - Audio Overview
3. Structured output validation and citation metadata preservation.
4. Ollama timeout / error resilience and graceful fallback.
5. Error handling when notebook has 0 sources or invalid source selections.
"""
import unittest
import os
import tempfile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["ORION_USE_MOCK_OLLAMA"] = "1"
os.environ["ORION_USE_MOCK_EMBEDDINGS"] = "1"

from database import Base, get_db
from main import app
import models
from ollama_client import MockOllamaClient, set_ollama_client


class TestStudioArtifacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.temp_dir.name, "test_studio.db")
        cls.engine = create_engine(
            f"sqlite:///{cls.db_path}",
            connect_args={"check_same_thread": False}
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        Base.metadata.create_all(bind=self.engine)

        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        set_ollama_client(MockOllamaClient())

        # Create test notebook A with 2 sources
        nb_res = self.client.post("/api/notebooks", json={"title": "Studio Test Notebook A"})
        self.assertEqual(nb_res.status_code, 201)
        self.notebook_a = nb_res.json()
        self.nb_a_id = self.notebook_a["id"]

        # Create source 1 in notebook A
        s1_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/sources",
            json={
                "title": "Module 5 Operating Systems Architecture",
                "content": (
                    "# Module 5 OS Architecture\n\n"
                    "Direct Memory Access (DMA) enables hardware subsystems to access main memory "
                    "directly without placing continuous load on the central processing unit.\n\n"
                    "## Cache Coherence Protocols\n\n"
                    "Snooping and directory-based protocols ensure multi-core processors maintain unified "
                    "memory views across private L1 and L2 caches.\n\n"
                    "## Virtual Memory and Paging\n\n"
                    "Multi-level page tables translate virtual addresses into physical frames, "
                    "leveraging the Translation Lookaside Buffer (TLB) to accelerate memory translation."
                ),
                "source_type": "txt",
                "is_selected": True
            }
        )
        self.assertEqual(s1_res.status_code, 201)
        self.src_1 = s1_res.json()

        # Create source 2 in notebook A
        s2_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/sources",
            json={
                "title": "Storage Protocols and IO Scheduling",
                "content": (
                    "# Storage Architecture\n\n"
                    "NVMe protocol provides up to 64,000 queues each supporting 64,000 concurrent commands, "
                    "vastly surpassing legacy SATA command depth.\n\n"
                    "## I/O Scheduling Algorithms\n\n"
                    "Elevator and deadline schedulers minimize disk head movement and guarantee bounded wait times."
                ),
                "source_type": "txt",
                "is_selected": True
            }
        )
        self.assertEqual(s2_res.status_code, 201)
        self.src_2 = s2_res.json()

        # Create test notebook B (empty, for isolation checks)
        nb_b_res = self.client.post("/api/notebooks", json={"title": "Notebook B (Isolation)"})
        self.assertEqual(nb_b_res.status_code, 201)
        self.notebook_b = nb_b_res.json()
        self.nb_b_id = self.notebook_b["id"]

    def tearDown(self):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)

    # -------------------------------------------------------------------------
    # CRUD & Notebook Isolation Tests
    # -------------------------------------------------------------------------
    def test_artifact_crud_and_notebook_isolation(self):
        # 1. Create artifact directly in Notebook A
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts",
            json={
                "artifact_type": "flashcards",
                "title": "Manual Card Deck",
                "structured_content": {
                    "cards": [{"id": "c1", "question": "What is DMA?", "answer": "Direct Memory Access"}]
                },
                "source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(create_res.status_code, 201)
        art = create_res.json()
        art_id = art["id"]
        self.assertEqual(art["notebook_id"], self.nb_a_id)
        self.assertEqual(art["title"], "Manual Card Deck")
        self.assertEqual(art["artifact_type"], "flashcards")
        self.assertEqual(art["source_ids"], [self.src_1["id"]])

        # 2. List artifacts for Notebook A
        list_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], art_id)

        # 3. Notebook B isolation: listing Notebook B artifacts must return empty
        list_b = self.client.get(f"/api/notebooks/{self.nb_b_id}/artifacts")
        self.assertEqual(list_b.status_code, 200)
        self.assertEqual(len(list_b.json()), 0)

        # 4. Accessing Notebook A artifact through Notebook B route must 404
        cross_res = self.client.get(f"/api/notebooks/{self.nb_b_id}/artifacts/{art_id}")
        self.assertEqual(cross_res.status_code, 404)

        # 5. Update artifact
        update_res = self.client.put(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}",
            json={"title": "Updated Deck Title"}
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["title"], "Updated Deck Title")

        # 6. Delete artifact
        del_res = self.client.delete(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["status"], "deleted")

        # Verify deletion
        get_after_del = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_after_del.status_code, 404)

    # -------------------------------------------------------------------------
    # Tool 1: Flashcards Generation
    # -------------------------------------------------------------------------
    def test_generate_flashcards(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "title": "Module 5 Core Flashcards",
                "selected_source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "flashcards")
        self.assertEqual(data["title"], "Module 5 Core Flashcards")
        content = data["structured_content"]
        self.assertIn("cards", content)
        cards = content["cards"]
        self.assertGreater(len(cards), 0)
        first_card = cards[0]
        self.assertIn("question", first_card)
        self.assertIn("answer", first_card)
        self.assertIn("category", first_card)
        self.assertIn("citation_index", first_card)

        # Verify citation metadata was persisted
        self.assertGreater(len(data["citations"]), 0)

        # Verify persisted to SQLite
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{data['id']}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["id"], data["id"])

    # -------------------------------------------------------------------------
    # Tool 2: Mind Map Generation
    # -------------------------------------------------------------------------
    def test_generate_mindmap(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "mindmap",
                "title": "OS Concept Mind Map"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "mindmap")
        content = data["structured_content"]
        self.assertIn("nodes", content)
        self.assertIn("edges", content)
        self.assertIn("root_id", content)
        nodes = content["nodes"]
        self.assertGreaterEqual(len(nodes), 2)
        # Root node exists
        self.assertTrue(any(n["id"] == content["root_id"] for n in nodes))
        # Edges connect nodes
        edges = content["edges"]
        if edges:
            node_ids = {n["id"] for n in nodes}
            for e in edges:
                self.assertIn(e["from"], node_ids)
                self.assertIn(e["to"], node_ids)

    # -------------------------------------------------------------------------
    # Tool 3: Reports Generation
    # -------------------------------------------------------------------------
    def test_generate_report(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "report",
                "title": "Comprehensive OS Architecture Report"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "report")
        content = data["structured_content"]
        self.assertIn("summary", content)
        self.assertIn("key_findings", content)
        self.assertIn("sections", content)
        self.assertIn("markdown", content)
        self.assertGreater(len(content["sections"]), 0)

    # -------------------------------------------------------------------------
    # Tool 4: Infographic Generation
    # -------------------------------------------------------------------------
    def test_generate_infographic(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "infographic",
                "title": "Operating Systems At A Glance"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "infographic")
        content = data["structured_content"]
        self.assertIn("stats", content)
        self.assertIn("key_takeaways", content)
        self.assertIn("process_steps", content)
        self.assertGreater(len(content["key_takeaways"]), 0)

    # -------------------------------------------------------------------------
    # Tool 5: Audio Overview Generation
    # -------------------------------------------------------------------------
    def test_generate_audio_overview(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "audio_overview",
                "title": "Architecture Deep Dive Podcast"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "audio_overview")
        content = data["structured_content"]
        self.assertIn("dialogue", content)
        dialogue = content["dialogue"]
        self.assertGreaterEqual(len(dialogue), 2)
        speakers = {d["speaker"] for d in dialogue}
        self.assertTrue(any("Alex" in s for s in speakers))
        self.assertTrue(any("Sam" in s for s in speakers))
        # Ensure time progression
        self.assertIn("startTime", dialogue[0])
        self.assertIn("duration", dialogue[0])

    # -------------------------------------------------------------------------
    # Edge Cases & Error Handling Tests
    # -------------------------------------------------------------------------
    def test_generate_with_empty_notebook_fails_gracefully(self):
        # Notebook B has 0 sources
        res = self.client.post(
            f"/api/notebooks/{self.nb_b_id}/artifacts/generate",
            json={"artifact_type": "flashcards"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Please add source documents", res.json()["detail"])

    def test_generate_with_empty_source_selection_fails_gracefully(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "selected_source_ids": []
            }
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("No sources are selected", res.json()["detail"])

    def test_generate_with_alien_source_id_fails_gracefully(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "selected_source_ids": ["src-nonexistent-1234"]
            }
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("None of the specified sources belong", res.json()["detail"])

    def test_ollama_failure_graceful_fallback(self):
        # Simulate Ollama connection failure
        mock_client = MockOllamaClient(simulate_error="connection")
        set_ollama_client(mock_client)

        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "flashcards"}
        )
        # Should gracefully fall back to deterministic grounded synthesis and succeed!
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "flashcards")
        self.assertGreater(len(data["structured_content"]["cards"]), 0)

    # -------------------------------------------------------------------------
    # Phase 3: Structured LLM-Generated Responses for All 5 Tools
    # -------------------------------------------------------------------------
    def test_structured_llm_generate_flashcards(self):
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "title": "LLM Flashcard Deck",
                "selected_source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "flashcards")
        self.assertEqual(data["title"], "LLM Generated Flashcard Deck")
        content = data["structured_content"]
        self.assertIn("cards", content)
        cards = content["cards"]
        self.assertEqual(len(cards), 3)
        self.assertEqual(cards[0]["question"], "What is Direct Memory Access (DMA)?")
        self.assertEqual(cards[0]["answer"], "DMA allows hardware devices to transfer data to and from memory without CPU intervention.")
        self.assertEqual(cards[0]["category"], "OS Architecture")
        self.assertIsNotNone(cards[0]["source_id"])
        self.assertIsNotNone(cards[0]["source_title"])
        self.assertIsNotNone(cards[0]["snippet"])

    def test_structured_llm_generate_mindmap(self):
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "mindmap",
                "title": "LLM Concept Mind Map"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "mindmap")
        content = data["structured_content"]
        self.assertEqual(content["root_id"], "node-root")
        nodes = content["nodes"]
        self.assertGreaterEqual(len(nodes), 4)
        node_ids = {n["id"] for n in nodes}
        self.assertIn("node-root", node_ids)
        self.assertIn("node-dma", node_ids)
        edges = content["edges"]
        self.assertGreaterEqual(len(edges), 3)
        for e in edges:
            self.assertIn(e["from"], node_ids)
            self.assertIn(e["to"], node_ids)
        root_node = next(n for n in nodes if n["id"] == "node-root")
        self.assertIn("source_title", root_node)

    def test_structured_llm_generate_report(self):
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "report",
                "title": "LLM Executive Report: Modern Systems Architecture"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "report")
        content = data["structured_content"]
        self.assertIn("summary", content)
        self.assertIn("key_findings", content)
        self.assertIn("sections", content)
        self.assertIn("inferences_and_strategic_notes", content)
        self.assertIn("markdown", content)
        self.assertIn("## Executive Summary", content["markdown"])
        self.assertIn("## Strategic Inferences & Analysis", content["markdown"])

    def test_structured_llm_generate_infographic(self):
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "infographic",
                "title": "LLM Visual Infographic: Systems At Scale"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "infographic")
        content = data["structured_content"]
        self.assertEqual(content["theme"], "emerald")
        self.assertEqual(len(content["stats"]), 2)
        self.assertEqual(content["stats"][0]["label"], "Memory Latency")
        self.assertEqual(len(content["key_takeaways"]), 2)
        self.assertEqual(len(content["process_steps"]), 2)
        self.assertEqual(len(content["comparison_points"]), 1)

    def test_structured_llm_generate_audio_overview(self):
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "audio_overview",
                "title": "LLM Audio Discussion: OS & Storage Deep Dive"
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "audio_overview")
        content = data["structured_content"]
        self.assertIn("dialogue", content)
        dialogue = content["dialogue"]
        self.assertEqual(len(dialogue), 4)
        self.assertEqual(dialogue[0]["speaker"], "Host A (Alex)")
        self.assertEqual(dialogue[1]["speaker"], "Host B (Sam)")
        self.assertGreater(content["total_duration"], 0)
        self.assertIn("hosts", content)

    # -------------------------------------------------------------------------
    # Phase 3: Schema Validation, Duplicate Handling, and Error Fallbacks
    # -------------------------------------------------------------------------
    def test_flashcard_deduplication(self):
        import json
        duplicate_response = json.dumps({
            "title": "Deduplication Test",
            "cards": [
                {
                    "question": "What is Direct Memory Access?",
                    "answer": "Bypasses CPU for RAM access.",
                    "category": "Memory",
                    "citation_index": 1
                },
                {
                    "question": "What is direct memory access?",
                    "answer": "Duplicate question with different casing.",
                    "category": "Memory",
                    "citation_index": 1
                },
                {
                    "question": "What is NVMe?",
                    "answer": "High-speed non-volatile memory protocol.",
                    "category": "Storage",
                    "citation_index": 2
                }
            ]
        })
        set_ollama_client(MockOllamaClient(simulated_response=duplicate_response))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "flashcards"}
        )
        self.assertEqual(res.status_code, 200)
        cards = res.json()["structured_content"]["cards"]
        self.assertEqual(len(cards), 2)
        questions = [c["question"].lower() for c in cards]
        self.assertIn("what is direct memory access?", questions)
        self.assertIn("what is nvme?", questions)

    def test_citation_mapping_and_out_of_bounds_index(self):
        import json
        out_of_bounds_response = json.dumps({
            "title": "Out of Bounds Citation Test",
            "cards": [
                {
                    "question": "What happens with citation 9999?",
                    "answer": "It should default safely to index 1 without crashing.",
                    "category": "Robustness",
                    "citation_index": 9999
                }
            ]
        })
        set_ollama_client(MockOllamaClient(simulated_response=out_of_bounds_response))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "flashcards"}
        )
        self.assertEqual(res.status_code, 200)
        cards = res.json()["structured_content"]["cards"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["citation_index"], 1)
        self.assertIsNotNone(cards[0]["source_id"])

    def test_malformed_json_triggers_fallback_safely(self):
        set_ollama_client(MockOllamaClient(simulate_error="malformed_json"))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "mindmap"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "mindmap")
        self.assertIn("nodes", data["structured_content"])
        self.assertGreaterEqual(len(data["structured_content"]["nodes"]), 2)

    def test_ollama_timeout_triggers_fallback(self):
        set_ollama_client(MockOllamaClient(simulate_error="timeout"))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "report"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "report")
        self.assertIn("summary", data["structured_content"])

    def test_ollama_model_not_found_triggers_fallback(self):
        set_ollama_client(MockOllamaClient(simulate_error="model_not_found"))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "infographic"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "infographic")
        self.assertIn("stats", data["structured_content"])

    # -------------------------------------------------------------------------
    # Phase 4: Persistence, Notebook Isolation, and Source Scoping
    # -------------------------------------------------------------------------
    def test_cross_notebook_update_and_delete_isolation(self):
        # Create an artifact in Notebook A
        art_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts",
            json={
                "artifact_type": "flashcards",
                "title": "Notebook A Private Deck",
                "structured_content": {"cards": []}
            }
        )
        self.assertEqual(art_res.status_code, 201)
        art_id = art_res.json()["id"]

        # Attempt to update via Notebook B -> 404
        put_res = self.client.put(
            f"/api/notebooks/{self.nb_b_id}/artifacts/{art_id}",
            json={"title": "Hacked Title"}
        )
        self.assertEqual(put_res.status_code, 404)

        # Attempt to delete via Notebook B -> 404
        del_res = self.client.delete(f"/api/notebooks/{self.nb_b_id}/artifacts/{art_id}")
        self.assertEqual(del_res.status_code, 404)

        # Verify Notebook A's artifact is still intact and unchanged
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["title"], "Notebook A Private Deck")

    def test_source_selection_respected_during_generation(self):
        # Generate selecting only src_1
        res1 = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "selected_source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertEqual(data1["source_ids"], [self.src_1["id"]])
        cit_source_ids_1 = {c["source_id"] for c in data1["citations"]}
        self.assertEqual(cit_source_ids_1, {self.src_1["id"]})

        # Generate selecting only src_2
        res2 = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "flashcards",
                "selected_source_ids": [self.src_2["id"]]
            }
        )
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(data2["source_ids"], [self.src_2["id"]])
        cit_source_ids_2 = {c["source_id"] for c in data2["citations"]}
        self.assertEqual(cit_source_ids_2, {self.src_2["id"]})

    def test_citation_metadata_preservation(self):
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "report",
                "selected_source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(len(data["citations"]), 0)
        first_cit = data["citations"][0]
        self.assertEqual(first_cit["source_id"], self.src_1["id"])
        self.assertEqual(first_cit["source_title"], self.src_1["title"])
        self.assertTrue(len(first_cit["snippet"]) > 0)
        self.assertIn("chunk_id", first_cit)
        self.assertIn("chunk_index", first_cit)

    def test_deleted_source_does_not_crash_artifact_retrieval(self):
        # Generate artifact referencing src_1
        art_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "mindmap",
                "selected_source_ids": [self.src_1["id"]]
            }
        )
        self.assertEqual(art_res.status_code, 200)
        art_id = art_res.json()["id"]

        # Now delete source 1
        del_src = self.client.delete(f"/api/notebooks/{self.nb_a_id}/sources/{self.src_1['id']}")
        self.assertEqual(del_src.status_code, 200)

        # Fetch artifact - must still return 200 with stored structured_content and citations
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        fetched = get_res.json()
        self.assertEqual(fetched["id"], art_id)
        self.assertGreater(len(fetched["citations"]), 0)

        # Listing artifacts must also succeed
        list_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts")
        self.assertEqual(list_res.status_code, 200)
        self.assertTrue(any(a["id"] == art_id for a in list_res.json()))

    def test_failed_generation_leaves_no_corrupt_artifacts(self):
        # Record initial artifact count
        init_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts")
        self.assertEqual(init_res.status_code, 200)
        initial_count = len(init_res.json())

        # Failed attempt 1: empty source list
        res_empty = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "flashcards", "selected_source_ids": []}
        )
        self.assertEqual(res_empty.status_code, 400)

        # Failed attempt 2: alien source ID
        res_alien = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "flashcards", "selected_source_ids": ["src-ghost-nonexistent"]}
        )
        self.assertEqual(res_alien.status_code, 400)

        # Failed attempt 3: invalid artifact type
        res_bad_type = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "quantum_teleporter"}
        )
        self.assertEqual(res_bad_type.status_code, 422)

        # Verify database artifact count is unchanged and no partial artifact was created
        final_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts")
        self.assertEqual(final_res.status_code, 200)
        self.assertEqual(len(final_res.json()), initial_count)

    # -------------------------------------------------------------------------
    # Audio Overview Regeneration, Freshness & Failure Recovery Suite
    # -------------------------------------------------------------------------
    def test_audio_overview_regeneration_success(self):
        """1. Successful regeneration updates and returns a newly generated dialogue with fresh content."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={
                "artifact_type": "audio_overview",
                "title": "Initial OS Podcast"
            }
        )
        self.assertEqual(create_res.status_code, 200)
        orig_art = create_res.json()
        art_id = orig_art["id"]
        orig_dialogue = orig_art["structured_content"]["dialogue"]
        orig_first_text = orig_dialogue[0]["text"]

        # Call regeneration endpoint
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}/regenerate",
            json={
                "focus_prompt": "Focus on high throughput storage queues"
            }
        )
        self.assertEqual(regen_res.status_code, 200)
        regen_art = regen_res.json()

        # Must preserve identity and update in-place
        self.assertEqual(regen_art["id"], art_id)
        self.assertEqual(regen_art["artifact_type"], "audio_overview")

        # Dialogue must be fresh and non-empty
        regen_dialogue = regen_art["structured_content"]["dialogue"]
        self.assertGreaterEqual(len(regen_dialogue), 2)
        regen_first_text = regen_dialogue[0]["text"]
        self.assertNotEqual(orig_first_text, regen_first_text, "Regeneration must produce fresh dialogue turns")

        # Verify DB persistence
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["structured_content"]["dialogue"][0]["text"], regen_first_text)

    def test_audio_overview_regeneration_different_fixtures(self):
        """2. Regenerated dialogue strictly reflects new fixture responses when generation fixture is varied."""
        custom_fixture = {
            "title": "Custom Fixture Episode",
            "dialogue": [
                {"speaker": "Host A (Alex)", "text": "Welcome to our specialized discussion on NVMe command concurrency."},
                {"speaker": "Host B (Sam)", "text": "Thanks Alex. The parallel queue architecture achieves remarkable IOPS scaling."}
            ]
        }
        # Create initial with auto mock
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        art_id = create_res.json()["id"]

        # Now simulate Ollama returning custom fixture on regeneration
        set_ollama_client(MockOllamaClient(simulated_response=custom_fixture))
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}/regenerate",
            json={"title": "Custom Fixture Episode"}
        )
        self.assertEqual(regen_res.status_code, 200)
        regen_data = regen_res.json()
        self.assertEqual(regen_data["title"], "Custom Fixture Episode")
        self.assertEqual(
            regen_data["structured_content"]["dialogue"][0]["text"],
            "Welcome to our specialized discussion on NVMe command concurrency."
        )

    def test_audio_overview_regeneration_invalid_model_output_rejected(self):
        """3. Invalid or malformed model output is rejected safely without destroying existing artifact."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        self.assertEqual(create_res.status_code, 200)
        orig_art = create_res.json()
        art_id = orig_art["id"]
        orig_text = orig_art["structured_content"]["dialogue"][0]["text"]

        # Simulate malformed JSON output from model
        set_ollama_client(MockOllamaClient(simulate_error="malformed_json"))
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}/regenerate"
        )
        # Must return 502 Bad Gateway with diagnostic error message
        self.assertEqual(regen_res.status_code, 502)
        self.assertIn("invalid artifact structure", regen_res.json()["detail"].lower())

        # Verify previous working artifact in DB is preserved unmodified!
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["structured_content"]["dialogue"][0]["text"], orig_text)

    def test_audio_overview_regeneration_ollama_connection_failure_preserves_artifact(self):
        """4. Ollama connection error produces HTTP 503 and preserves existing artifact."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        art_id = create_res.json()["id"]
        orig_text = create_res.json()["structured_content"]["dialogue"][0]["text"]

        # Simulate Ollama connection failure
        set_ollama_client(MockOllamaClient(simulate_error="connection"))
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}/regenerate"
        )
        self.assertEqual(regen_res.status_code, 503)
        self.assertIn("unavailable", regen_res.json()["detail"].lower())

        # Verify DB artifact unchanged
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["structured_content"]["dialogue"][0]["text"], orig_text)

    def test_audio_overview_regeneration_ollama_timeout_preserves_artifact(self):
        """5. Ollama timeout produces HTTP 504 and preserves existing artifact."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        art_id = create_res.json()["id"]
        orig_text = create_res.json()["structured_content"]["dialogue"][0]["text"]

        # Simulate timeout
        set_ollama_client(MockOllamaClient(simulate_error="timeout"))
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}/regenerate"
        )
        self.assertEqual(regen_res.status_code, 504)
        self.assertIn("timed out", regen_res.json()["detail"].lower())

        # Verify DB artifact unchanged
        get_res = self.client.get(f"/api/notebooks/{self.nb_a_id}/artifacts/{art_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["structured_content"]["dialogue"][0]["text"], orig_text)

    def test_audio_overview_regeneration_notebook_isolation(self):
        """6. Notebook isolation is enforced during artifact regeneration."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        art_id = create_res.json()["id"]

        # Attempt to regenerate using Notebook B's ID -> 404
        regen_res = self.client.post(
            f"/api/notebooks/{self.nb_b_id}/artifacts/{art_id}/regenerate"
        )
        self.assertEqual(regen_res.status_code, 404)

    def test_audio_overview_response_shape_and_voice_roles(self):
        """7 & 8. Verify dialogue shape, timing, hosts, and speaker role consistency for TTS voice assignment."""
        set_ollama_client(MockOllamaClient(auto_studio_responses=True))
        create_res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview"}
        )
        art = create_res.json()
        sc = art["structured_content"]
        self.assertIn("dialogue", sc)
        self.assertIn("hosts", sc)
        self.assertIn("total_duration", sc)
        self.assertGreater(sc["total_duration"], 0)

        dialogue = sc["dialogue"]
        speakers = set()
        for turn in dialogue:
            self.assertIn("id", turn)
            self.assertIn("speaker", turn)
            self.assertIn("text", turn)
            self.assertIn("startTime", turn)
            self.assertIn("duration", turn)
            self.assertGreater(turn["duration"], 0)
            speakers.add(turn["speaker"])

        # Validate standard speaker labels are recognized by TTS voice selector
        self.assertTrue(any("Alex" in s or "Host A" in s for s in speakers))
        self.assertTrue(any("Sam" in s or "Host B" in s for s in speakers))

    def test_audio_overview_initial_generation_ollama_offline_fallback(self):
        """Regression test: initial generation succeeds with grounded fallback when Ollama is offline."""
        set_ollama_client(MockOllamaClient(simulate_error="connection"))
        res = self.client.post(
            f"/api/notebooks/{self.nb_a_id}/artifacts/generate",
            json={"artifact_type": "audio_overview", "title": "Offline Overview"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["artifact_type"], "audio_overview")
        sc = data["structured_content"]
        self.assertIn("dialogue", sc)
        self.assertGreaterEqual(len(sc["dialogue"]), 2)
        # Verify speakers are present
        speakers = {turn["speaker"] for turn in sc["dialogue"]}
        self.assertTrue(any("Alex" in s or "Host A" in s for s in speakers))
        self.assertTrue(any("Sam" in s or "Host B" in s for s in speakers))


if __name__ == "__main__":
    unittest.main()

