import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
import main


class TestSourceLifecycleAndPersistence(unittest.TestCase):
    def setUp(self):
        # Create an isolated temporary directory for test SQLite database
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_sources.db"
        self.db_url = f"sqlite:///{self.db_path}"

        # Setup isolated database engine and session
        self.engine = create_engine(
            self.db_url,
            connect_args={"check_same_thread": False}
        )
        self.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        # Override FastAPI get_db dependency
        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        from embedding import MockEmbeddingService
        from vector_store import PersistentVectorStore
        self.vector_dir = Path(self.temp_dir.name) / "vector_store"
        self.mock_embedder = MockEmbeddingService(dim=384)
        self.vector_store = PersistentVectorStore(
            persist_dir=str(self.vector_dir),
            embedding_service=self.mock_embedder
        )

        main.app.dependency_overrides[get_db] = override_get_db
        main.app.dependency_overrides[main.get_vector_index] = lambda: self.vector_store
        main.app.dependency_overrides[main.get_embeddings] = lambda: self.mock_embedder
        self.client = TestClient(main.app)

        # Create a primary test notebook
        nb_res = self.client.post("/api/notebooks", json={"title": "Primary Test Notebook"})
        self.assertEqual(nb_res.status_code, 201)
        self.nb_id = nb_res.json()["id"]

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_01_ingest_source_into_valid_notebook(self):
        """1. Ingest a source into a valid notebook and verify response."""
        payload = {
            "title": "Attention Is All You Need",
            "content": "# Background\n\nTransformers replace recurrence with self-attention mechanisms.\n\n# Model Architecture\n\nThe multi-head attention operates across key, query, and value projections.",
            "source_type": "pdf",
            "summary": "Foundational transformer architecture paper.",
            "is_selected": True,
            "metadata": {"filename": "attention.pdf", "page_count": 15}
        }
        res = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data["id"].startswith("src-"))
        self.assertEqual(data["notebook_id"], self.nb_id)
        self.assertEqual(data["title"], "Attention Is All You Need")
        self.assertEqual(data["source_type"], "pdf")
        self.assertGreater(data["word_count"], 0)
        self.assertTrue(data["is_selected"])
        self.assertIn("chunks", data)
        self.assertGreater(len(data["chunks"]), 0)

    def test_02_retrieve_source_and_metadata(self):
        """2. Retrieve the source and verify its metadata and fields."""
        payload = {
            "title": "Quantum Principles",
            "content": "Superposition and entanglement are fundamental resources for quantum computing.",
            "source_type": "txt",
            "metadata": {"author": "Nielsen & Chuang", "year": 2000}
        }
        created = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json=payload).json()
        src_id = created["id"]

        get_res = self.client.get(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(get_res.status_code, 200)
        source = get_res.json()
        self.assertEqual(source["id"], src_id)
        self.assertEqual(source["title"], "Quantum Principles")
        self.assertEqual(source["meta_info"]["author"], "Nielsen & Chuang")
        self.assertEqual(source["meta_info"]["year"], 2000)

    def test_03_verify_chunks_persisted_in_order(self):
        """3. Verify document chunks are persisted in stable chunk_index order."""
        long_content = "\n\n".join([f"Paragraph {i}: This is detailed content discussing concept number {i} with sufficient words to populate individual chunks." for i in range(12)])
        payload = {
            "title": "Long Multichunk Document",
            "content": long_content,
            "source_type": "md"
        }
        created = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json=payload).json()
        src_id = created["id"]

        get_res = self.client.get(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(get_res.status_code, 200)
        chunks = get_res.json()["chunks"]
        self.assertGreater(len(chunks), 1)

        # Check consecutive stable ordering
        for idx, chunk in enumerate(chunks):
            self.assertEqual(chunk["chunk_index"], idx)
            self.assertEqual(chunk["source_id"], src_id)
            self.assertTrue(len(chunk["text_content"]) > 0)

    def test_04_sources_isolated_between_notebooks(self):
        """4. Verify sources in Notebook A do not appear in Notebook B."""
        # Create second notebook
        nb_b = self.client.post("/api/notebooks", json={"title": "Notebook B"}).json()["id"]

        # Add source to Notebook A
        src_a = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source in Notebook A",
            "content": "Content exclusively for notebook A.",
            "source_type": "txt"
        }).json()

        # Add source to Notebook B
        src_b = self.client.post(f"/api/notebooks/{nb_b}/sources", json={
            "title": "Source in Notebook B",
            "content": "Content exclusively for notebook B.",
            "source_type": "txt"
        }).json()

        # List A
        list_a = self.client.get(f"/api/notebooks/{self.nb_id}/sources").json()
        ids_a = [s["id"] for s in list_a]
        self.assertIn(src_a["id"], ids_a)
        self.assertNotIn(src_b["id"], ids_a)

        # List B
        list_b = self.client.get(f"/api/notebooks/{nb_b}/sources").json()
        ids_b = [s["id"] for s in list_b]
        self.assertIn(src_b["id"], ids_b)
        self.assertNotIn(src_a["id"], ids_b)

    def test_05_reject_empty_content_and_invalid_type(self):
        """5. Reject empty content, whitespace title, and invalid source types with 422."""
        # Empty content
        res1 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "No Content",
            "content": "   ",
            "source_type": "txt"
        })
        self.assertEqual(res1.status_code, 422)

        # Empty title
        res2 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "   ",
            "content": "Valid content.",
            "source_type": "txt"
        })
        self.assertEqual(res2.status_code, 422)

        # Invalid source type
        res3 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Bad Type",
            "content": "Valid content.",
            "source_type": "executable_binary"
        })
        self.assertEqual(res3.status_code, 422)

    def test_06_return_404_nonexistent_notebook_and_source(self):
        """6. Return 404 for nonexistent notebook or nonexistent source."""
        # Nonexistent notebook
        res1 = self.client.get("/api/notebooks/nb-nonexistent-999/sources")
        self.assertEqual(res1.status_code, 404)

        res2 = self.client.post("/api/notebooks/nb-nonexistent-999/sources", json={
            "title": "Ghost Source",
            "content": "Ghost content",
            "source_type": "txt"
        })
        self.assertEqual(res2.status_code, 404)

        # Nonexistent source in valid notebook
        res3 = self.client.get(f"/api/notebooks/{self.nb_id}/sources/src-nonexistent-999")
        self.assertEqual(res3.status_code, 404)

    def test_07_reject_source_id_against_wrong_notebook(self):
        """7. Reject source ID belonging to Notebook A when accessed via Notebook B."""
        nb_b = self.client.post("/api/notebooks", json={"title": "Notebook B"}).json()["id"]

        src_a = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source A",
            "content": "Content A",
            "source_type": "txt"
        }).json()
        src_a_id = src_a["id"]

        # Attempt to access Source A through Notebook B
        res_get = self.client.get(f"/api/notebooks/{nb_b}/sources/{src_a_id}")
        self.assertEqual(res_get.status_code, 404)

        # Attempt to delete Source A through Notebook B
        res_del = self.client.delete(f"/api/notebooks/{nb_b}/sources/{src_a_id}")
        self.assertEqual(res_del.status_code, 404)

        # Attempt to patch Source A through Notebook B
        res_patch = self.client.patch(f"/api/notebooks/{nb_b}/sources/{src_a_id}", json={"is_selected": False})
        self.assertEqual(res_patch.status_code, 404)

    def test_08_delete_source_removes_chunks(self):
        """8. Deleting a source deletes the source record and all its chunks."""
        src = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source to Delete",
            "content": "This content has multiple chunks.\n\nChunk two content here.\n\nChunk three content.",
            "source_type": "txt"
        }).json()
        src_id = src["id"]

        # Check DB directly for chunks
        db = self.TestingSessionLocal()
        chunks_count_before = db.query(models.SourceChunk).filter(models.SourceChunk.source_id == src_id).count()
        self.assertGreater(chunks_count_before, 0)
        db.close()

        # Delete via API
        del_res = self.client.delete(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["status"], "deleted")

        # Confirm source is gone
        get_res = self.client.get(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(get_res.status_code, 404)

        # Confirm chunks are gone in DB
        db = self.TestingSessionLocal()
        chunks_count_after = db.query(models.SourceChunk).filter(models.SourceChunk.source_id == src_id).count()
        self.assertEqual(chunks_count_after, 0)
        db.close()

    def test_09_delete_notebook_cascades_sources_and_chunks(self):
        """9. Deleting a notebook removes all its sources and their chunks."""
        nb_temp = self.client.post("/api/notebooks", json={"title": "Temporary Notebook"}).json()["id"]

        src = self.client.post(f"/api/notebooks/{nb_temp}/sources", json={
            "title": "Temp Source",
            "content": "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
            "source_type": "txt"
        }).json()
        src_id = src["id"]

        db = self.TestingSessionLocal()
        self.assertEqual(db.query(models.Source).filter(models.Source.id == src_id).count(), 1)
        self.assertGreater(db.query(models.SourceChunk).filter(models.SourceChunk.source_id == src_id).count(), 0)
        db.close()

        # Delete notebook
        del_nb = self.client.delete(f"/api/notebooks/{nb_temp}")
        self.assertEqual(del_nb.status_code, 200)

        # Verify sources and chunks are completely gone
        db = self.TestingSessionLocal()
        self.assertEqual(db.query(models.Source).filter(models.Source.id == src_id).count(), 0)
        self.assertEqual(db.query(models.SourceChunk).filter(models.SourceChunk.source_id == src_id).count(), 0)
        db.close()

    def test_10_persistence_across_reconnection(self):
        """10. Verify persisted sources remain available after database engine / connection recreation."""
        src = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Persistent Source",
            "content": "Crucial scientific data to persist across restarts.",
            "source_type": "md"
        }).json()
        src_id = src["id"]

        # Simulate engine teardown and recreation pointing to the same SQLite file
        self.engine.dispose()
        main.app.dependency_overrides.clear()

        restarted_engine = create_engine(self.db_url, connect_args={"check_same_thread": False})
        RestartedSession = sessionmaker(autocommit=False, autoflush=False, bind=restarted_engine)

        def restarted_get_db():
            db = RestartedSession()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[get_db] = restarted_get_db
        main.app.dependency_overrides[main.get_vector_index] = lambda: self.vector_store
        main.app.dependency_overrides[main.get_embeddings] = lambda: self.mock_embedder
        restarted_client = TestClient(main.app)

        # Check source and chunks survive
        res = restarted_client.get(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], src_id)
        self.assertEqual(data["title"], "Persistent Source")
        self.assertGreater(len(data["chunks"]), 0)

        restarted_engine.dispose()

    def test_11_patch_source_selection(self):
        """11. Verify PATCH endpoint toggles is_selected and updates title."""
        src = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source To Toggle",
            "content": "Some text content here.",
            "source_type": "txt",
            "is_selected": True
        }).json()
        src_id = src["id"]

        # Deselect
        patch_res = self.client.patch(f"/api/notebooks/{self.nb_id}/sources/{src_id}", json={
            "is_selected": False
        })
        self.assertEqual(patch_res.status_code, 200)
        self.assertFalse(patch_res.json()["is_selected"])

        # Re-select
        patch_res2 = self.client.patch(f"/api/notebooks/{self.nb_id}/sources/{src_id}", json={
            "is_selected": True,
            "title": "Updated Source Title"
        })
        self.assertEqual(patch_res2.status_code, 200)
        self.assertTrue(patch_res2.json()["is_selected"])
        self.assertEqual(patch_res2.json()["title"], "Updated Source Title")


if __name__ == "__main__":
    unittest.main()
