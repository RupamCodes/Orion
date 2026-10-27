import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import main


class TestNotebookLifecycleAndPersistence(unittest.TestCase):
    def setUp(self):
        # Create an isolated temporary directory for test SQLite database
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_orion.db"
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

        main.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_01_create_notebook(self):
        """Verify notebook creation with 201 status and auto-generated fields."""
        payload = {
            "title": "Quantum Computing Research",
            "description": "Exploration of qubit coherence and error correction."
        }
        res = self.client.post("/api/notebooks", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data["id"].startswith("nb-"))
        self.assertEqual(data["title"], "Quantum Computing Research")
        self.assertEqual(data["description"], "Exploration of qubit coherence and error correction.")
        self.assertEqual(data["user_id"], "local_user")
        self.assertIn("created_at", data)
        self.assertIn("updated_at", data)

    def test_02_create_notebook_validation(self):
        """Verify validation rules: empty title or whitespace-only is rejected with 422."""
        res_empty = self.client.post("/api/notebooks", json={"title": "   "})
        self.assertEqual(res_empty.status_code, 422)

        res_missing = self.client.post("/api/notebooks", json={"description": "No title provided"})
        self.assertEqual(res_missing.status_code, 422)

    def test_03_list_notebooks(self):
        """Verify notebook listing ordered by most recently updated first."""
        res1 = self.client.post("/api/notebooks", json={"title": "Notebook A"})
        self.assertEqual(res1.status_code, 201)
        res2 = self.client.post("/api/notebooks", json={"title": "Notebook B"})
        self.assertEqual(res2.status_code, 201)

        list_res = self.client.get("/api/notebooks")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertGreaterEqual(len(items), 2)
        # Notebook B was created last, should be first
        self.assertEqual(items[0]["title"], "Notebook B")
        self.assertEqual(items[1]["title"], "Notebook A")

    def test_04_get_notebook_by_id(self):
        """Verify retrieving a notebook by ID and 404 for missing ID."""
        created = self.client.post("/api/notebooks", json={"title": "Single Test"}).json()
        nb_id = created["id"]

        get_res = self.client.get(f"/api/notebooks/{nb_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["id"], nb_id)
        self.assertEqual(get_res.json()["title"], "Single Test")

        # 404 on nonexistent ID
        missing_res = self.client.get("/api/notebooks/nb-nonexistent-id-999")
        self.assertEqual(missing_res.status_code, 404)
        self.assertIn("detail", missing_res.json())

    def test_05_update_notebook(self):
        """Verify updating notebook title and description with PATCH."""
        created = self.client.post("/api/notebooks", json={
            "title": "Draft Title",
            "description": "Initial draft"
        }).json()
        nb_id = created["id"]

        patch_res = self.client.patch(f"/api/notebooks/{nb_id}", json={
            "title": "Finalized Title",
            "description": "Updated description"
        })
        self.assertEqual(patch_res.status_code, 200)
        updated = patch_res.json()
        self.assertEqual(updated["title"], "Finalized Title")
        self.assertEqual(updated["description"], "Updated description")

        # Verify update on nonexistent ID returns 404
        missing_patch = self.client.patch("/api/notebooks/nb-nonexistent", json={"title": "New"})
        self.assertEqual(missing_patch.status_code, 404)

    def test_06_delete_notebook(self):
        """Verify notebook deletion and subsequent 404."""
        created = self.client.post("/api/notebooks", json={"title": "To Delete"}).json()
        nb_id = created["id"]

        del_res = self.client.delete(f"/api/notebooks/{nb_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["status"], "deleted")
        self.assertEqual(del_res.json()["id"], nb_id)

        # Confirm it's gone
        get_res = self.client.get(f"/api/notebooks/{nb_id}")
        self.assertEqual(get_res.status_code, 404)

        # Deleting again returns 404
        del_again = self.client.delete(f"/api/notebooks/{nb_id}")
        self.assertEqual(del_again.status_code, 404)

    def test_07_persistence_across_backend_restart(self):
        """
        Verify data persistence across simulated backend restart:
        Close session and engine, re-instantiate against the same SQLite file,
        and verify all created notebooks are intact.
        """
        created = self.client.post("/api/notebooks", json={
            "title": "Persistent AI Notebook",
            "description": "Should survive backend restart."
        }).json()
        nb_id = created["id"]

        # Simulate shutdown: dispose current engine and clear overrides
        self.engine.dispose()
        main.app.dependency_overrides.clear()

        # Simulate restart: create new engine pointing to the EXACT same SQLite file
        restarted_engine = create_engine(
            self.db_url,
            connect_args={"check_same_thread": False}
        )
        RestartedSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=restarted_engine)

        def restarted_get_db():
            db = RestartedSessionLocal()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[get_db] = restarted_get_db
        restarted_client = TestClient(main.app)

        # Verify notebook still exists
        res = restarted_client.get(f"/api/notebooks/{nb_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], nb_id)
        self.assertEqual(data["title"], "Persistent AI Notebook")
        self.assertEqual(data["description"], "Should survive backend restart.")

        restarted_engine.dispose()

    def test_08_existing_endpoints_unbroken(self):
        """Verify that all existing endpoints still register and function as before."""
        # 1. Health check
        health_res = self.client.get("/api/health")
        self.assertEqual(health_res.status_code, 200)
        self.assertEqual(health_res.json()["status"], "healthy")

        # 2. Source ingestion
        ingest_res = self.client.post("/api/sources/ingest", json={
            "title": "Test Paper",
            "content": "Retrieval Augmented Generation grounded in sources.",
            "source_type": "txt"
        })
        self.assertEqual(ingest_res.status_code, 200)
        self.assertEqual(ingest_res.json()["status"], "success")

        # 3. Query
        query_res = self.client.post("/api/query", json={
            "query": "Retrieval Augmented Generation",
            "top_k": 2
        })
        self.assertEqual(query_res.status_code, 200)
        self.assertIn("answer", query_res.json())
        self.assertIn("citations", query_res.json())

        # 4. Studio artifact
        art_res = self.client.post("/api/studio/artifact", json={
            "artifact_type": "briefing",
            "topic": "Architecture Summary"
        })
        self.assertEqual(art_res.status_code, 200)
        self.assertEqual(art_res.json()["artifact_type"], "briefing")

        # 5. Pin note
        pin_res = self.client.post("/api/notes/pin-to-source", json={
            "note_id": "test-note-1",
            "title": "Key Insight",
            "content": "Important finding from study."
        })
        self.assertEqual(pin_res.status_code, 200)
        self.assertEqual(pin_res.json()["status"], "converted")


if __name__ == "__main__":
    unittest.main()
