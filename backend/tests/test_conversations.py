"""
Orion Phase 7 Automated Test Suite: Persistent Chat History
Tests conversation creation, message persistence, chronological ordering, renaming,
cascading deletion, notebook isolation, invalid ID handling, citation restoration,
source deletion resilience, and Ollama failure safeguards.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Ensure offline mock mode for both embeddings and Ollama
os.environ["ORION_USE_MOCK_EMBEDDINGS"] = "1"
os.environ["ORION_USE_MOCK_OLLAMA"] = "1"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import main
import models
from embedding import MockEmbeddingService
from vector_store import PersistentVectorStore
from ollama_client import (
    MockOllamaClient,
    OllamaConnectionError,
    OllamaModelNotFoundError,
    OllamaTimeoutError
)


class TestPersistentChatHistory(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_chat_history.db"
        self.db_url = f"sqlite:///{self.db_path}"
        self.vector_dir = Path(self.temp_dir.name) / "vector_store"

        self.engine = create_engine(
            self.db_url,
            connect_args={"check_same_thread": False}
        )
        self.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        self.mock_embedder = MockEmbeddingService(dim=384)
        self.vector_store = PersistentVectorStore(
            persist_dir=str(self.vector_dir),
            embedding_service=self.mock_embedder
        )
        self.mock_ollama = MockOllamaClient()

        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[get_db] = override_get_db
        main.app.dependency_overrides[main.get_vector_index] = lambda: self.vector_store
        main.app.dependency_overrides[main.get_embeddings] = lambda: self.mock_embedder
        main.app.dependency_overrides[main.get_ollama] = lambda: self.mock_ollama

        self.client = TestClient(main.app)

        # Create two isolated notebooks
        nb_res = self.client.post("/api/notebooks", json={"title": "Primary Research Notebook"})
        self.assertEqual(nb_res.status_code, 201)
        self.nb_id = nb_res.json()["id"]

        nb_res2 = self.client.post("/api/notebooks", json={"title": "Secondary Studio Notebook"})
        self.assertEqual(nb_res2.status_code, 201)
        self.nb_id_2 = nb_res2.json()["id"]

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_01_create_conversation_default_and_custom(self):
        """Creates conversations with default 'New Conversation' title and with custom title."""
        # Default title
        res = self.client.post(f"/api/notebooks/{self.nb_id}/conversations")
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["title"], "New Conversation")
        self.assertEqual(data["notebook_id"], self.nb_id)
        self.assertTrue(data["id"].startswith("conv-"))
        self.assertEqual(data["message_count"], 0)

        # Custom title
        res2 = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={
            "title": "Quantum Physics Study Session"
        })
        self.assertEqual(res2.status_code, 201)
        data2 = res2.json()
        self.assertEqual(data2["title"], "Quantum Physics Study Session")

    def test_02_list_conversations_ordered(self):
        """Lists conversations ordered by updated_at descending."""
        c1 = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "First Conv"}).json()
        c2 = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Second Conv"}).json()

        res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 2)
        # Most recently created/updated is first
        self.assertEqual(items[0]["id"], c2["id"])
        self.assertEqual(items[1]["id"], c1["id"])

    def test_03_get_conversation_detail_and_messages(self):
        """Retrieves conversation details and messages list."""
        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Detail Test"}).json()
        conv_id = conv["id"]

        detail_res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}")
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.json()["title"], "Detail Test")
        self.assertEqual(detail_res.json()["messages"], [])

        msgs_res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages")
        self.assertEqual(msgs_res.status_code, 200)
        self.assertEqual(msgs_res.json(), [])

    def test_04_rename_conversation(self):
        """Renames a conversation and validates input."""
        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Initial Title"}).json()
        conv_id = conv["id"]

        # Valid rename
        patch_res = self.client.patch(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}", json={
            "title": "Renamed Title"
        })
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["title"], "Renamed Title")

        # Empty title validation
        bad_patch = self.client.patch(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}", json={
            "title": "   "
        })
        self.assertEqual(bad_patch.status_code, 422)

    def test_05_delete_conversation_cascades(self):
        """Deleting a conversation deletes all associated messages."""
        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "To Delete"}).json()
        conv_id = conv["id"]

        # Add source and send a message
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Doc",
            "content": "Sample content about astrophysics.",
            "source_type": "txt"
        })
        self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "What is astrophysics?"
        })

        # Check DB messages exist
        with self.TestingSessionLocal() as db:
            count = db.query(models.Message).filter(models.Message.conversation_id == conv_id).count()
            self.assertGreater(count, 0)

        # Delete conversation
        del_res = self.client.delete(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["status"], "deleted")

        # Check messages were cascade deleted
        with self.TestingSessionLocal() as db:
            count_after = db.query(models.Message).filter(models.Message.conversation_id == conv_id).count()
            self.assertEqual(count_after, 0)

        # Getting deleted conversation returns 404
        get_res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}")
        self.assertEqual(get_res.status_code, 404)

    def test_06_notebook_isolation(self):
        """Conversations are isolated per notebook and cross-notebook requests return 404."""
        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Notebook 1 Conv"}).json()
        conv_id = conv["id"]

        # Trying to access conv from notebook 2 returns 404
        get_res = self.client.get(f"/api/notebooks/{self.nb_id_2}/conversations/{conv_id}")
        self.assertEqual(get_res.status_code, 404)

        msgs_res = self.client.get(f"/api/notebooks/{self.nb_id_2}/conversations/{conv_id}/messages")
        self.assertEqual(msgs_res.status_code, 404)

        patch_res = self.client.patch(f"/api/notebooks/{self.nb_id_2}/conversations/{conv_id}", json={"title": "Hacked"})
        self.assertEqual(patch_res.status_code, 404)

        del_res = self.client.delete(f"/api/notebooks/{self.nb_id_2}/conversations/{conv_id}")
        self.assertEqual(del_res.status_code, 404)

        send_res = self.client.post(f"/api/notebooks/{self.nb_id_2}/conversations/{conv_id}/messages", json={
            "message": "Hello from wrong notebook"
        })
        self.assertEqual(send_res.status_code, 404)

    def test_07_invalid_ids_return_404(self):
        """Invalid notebook or conversation IDs return 404."""
        res1 = self.client.get("/api/notebooks/nonexistent-nb/conversations")
        self.assertEqual(res1.status_code, 404)

        res2 = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/nonexistent-conv")
        self.assertEqual(res2.status_code, 404)

        res3 = self.client.delete(f"/api/notebooks/{self.nb_id}/conversations/nonexistent-conv")
        self.assertEqual(res3.status_code, 404)

    def test_08_grounded_chat_persists_messages_and_citations(self):
        """Sending grounded message persists user message and assistant response with structured citations."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Quantum Duality",
            "content": "# Wave-Particle Duality\n\nElectrons exhibit both wave and particle characteristics in double-slit interference experiments.",
            "source_type": "txt"
        })

        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations").json()
        conv_id = conv["id"]

        chat_res = self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "What dual characteristics do electrons exhibit?"
        })
        self.assertEqual(chat_res.status_code, 200)
        data = chat_res.json()

        self.assertIn("answer", data)
        self.assertEqual(data["conversation_id"], conv_id)
        self.assertEqual(data["notebook_id"], self.nb_id)
        self.assertGreater(len(data["citations"]), 0)

        # Check structured citation properties
        cit = data["citations"][0]
        self.assertIn("source_id", cit)
        self.assertIn("chunk_id", cit)
        self.assertEqual(cit["source_title"], "Quantum Duality")
        self.assertIn("snippet", cit)

        # Retrieve messages via endpoint and verify persistence
        msgs_res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages")
        self.assertEqual(msgs_res.status_code, 200)
        messages = msgs_res.json()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["content"], "What dual characteristics do electrons exhibit?")
        self.assertEqual(messages[1]["role"], "assistant")
        self.assertGreater(len(messages[1]["citations"]), 0)

        # Conversation should be auto-titled from first query
        detail = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}").json()
        self.assertNotEqual(detail["title"], "New Conversation")
        self.assertTrue("electrons" in detail["title"].lower() or "what" in detail["title"].lower())

    def test_09_failed_generation_preserves_user_message(self):
        """When Ollama fails, user message is safely persisted to SQLite and not lost."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Physics",
            "content": "General relativity describes spacetime curvature.",
            "source_type": "txt"
        })

        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Error Conv"}).json()
        conv_id = conv["id"]

        # Mock Ollama offline connection failure
        self.mock_ollama.simulate_error = "connection"

        chat_res = self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "Explain spacetime curvature in general relativity."
        })
        self.assertEqual(chat_res.status_code, 503)

        # Reset mock
        self.mock_ollama.simulate_error = None

        # Check SQLite DB: the user message MUST be preserved!
        msgs_res = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages")
        self.assertEqual(msgs_res.status_code, 200)
        messages = msgs_res.json()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["content"], "Explain spacetime curvature in general relativity.")

    def test_10_retry_does_not_duplicate_user_message(self):
        """Retrying a message after a failed generation does not create duplicate user messages."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Physics",
            "content": "General relativity describes spacetime curvature.",
            "source_type": "txt"
        })

        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Retry Conv"}).json()
        conv_id = conv["id"]

        # 1. Fail first attempt
        self.mock_ollama.simulate_error = "timeout"
        self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "Explain spacetime curvature."
        })
        self.mock_ollama.simulate_error = None

        # 2. Retry with same message
        retry_res = self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "Explain spacetime curvature."
        })
        self.assertEqual(retry_res.status_code, 200)

        # 3. Verify total user messages in conversation is 1 (not 2)
        msgs = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages").json()
        user_msgs = [m for m in msgs if m["role"] == "user"]
        self.assertEqual(len(user_msgs), 1)

    def test_11_citation_preservation_when_source_deleted(self):
        """Historical citations retain structured metadata even after source is deleted from notebook."""
        src_res = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Temporary Quantum Paper",
            "content": "Quantum entanglement occurs when pairs of particles interact physically.",
            "source_type": "txt"
        })
        src_id = src_res.json()["id"]

        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations").json()
        conv_id = conv["id"]

        # Send message and get citations
        self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "What is quantum entanglement?"
        })

        # Delete source from notebook
        del_src_res = self.client.delete(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(del_src_res.status_code, 200)

        # Retrieve conversation messages
        msgs = self.client.get(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages").json()
        self.assertEqual(len(msgs), 2)
        asst_msg = msgs[1]
        self.assertEqual(asst_msg["role"], "assistant")
        self.assertGreater(len(asst_msg["citations"]), 0)
        # Verify historical metadata is preserved
        cit = asst_msg["citations"][0]
        self.assertEqual(cit["source_id"], src_id)
        self.assertEqual(cit["source_title"], "Temporary Quantum Paper")
        self.assertTrue("entanglement" in cit["snippet"].lower())

    def test_12_delete_notebook_cascades_conversations_and_messages(self):
        """Deleting a notebook cascades to delete all its conversations and messages."""
        conv = self.client.post(f"/api/notebooks/{self.nb_id}/conversations", json={"title": "Cascade Conv"}).json()
        conv_id = conv["id"]

        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Temp Doc",
            "content": "Some content.",
            "source_type": "txt"
        })
        self.client.post(f"/api/notebooks/{self.nb_id}/conversations/{conv_id}/messages", json={
            "message": "Test question"
        })

        # Delete notebook
        del_nb_res = self.client.delete(f"/api/notebooks/{self.nb_id}")
        self.assertEqual(del_nb_res.status_code, 200)

        # Check DB that conversation and messages are gone
        with self.TestingSessionLocal() as db:
            c = db.query(models.Conversation).filter(models.Conversation.id == conv_id).first()
            self.assertIsNone(c)
            m_count = db.query(models.Message).filter(models.Message.conversation_id == conv_id).count()
            self.assertEqual(m_count, 0)


if __name__ == "__main__":
    unittest.main()
