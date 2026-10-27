"""
Orion Phase 6A Automated Test Suite: Local Semantic Retrieval
Validates persistent vector search, strict notebook isolation, index lifecycle,
rebuilding from SQLite, input validation, and offline deterministic execution.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Ensure offline mock embeddings by default during test execution
os.environ["ORION_USE_MOCK_EMBEDDINGS"] = "1"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
import main
from embedding import MockEmbeddingService
from vector_store import PersistentVectorStore


class TestSemanticRetrieval(unittest.TestCase):
    def setUp(self):
        # Create an isolated temporary directory for test SQLite DB and ChromaDB
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_semantic.db"
        self.db_url = f"sqlite:///{self.db_path}"
        self.vector_dir = Path(self.temp_dir.name) / "vector_store"

        # Setup isolated SQLite database engine
        self.engine = create_engine(
            self.db_url,
            connect_args={"check_same_thread": False}
        )
        self.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        # Setup isolated deterministic mock embedding service and persistent vector store
        self.mock_embedder = MockEmbeddingService(dim=384)
        self.vector_store = PersistentVectorStore(
            persist_dir=str(self.vector_dir),
            embedding_service=self.mock_embedder
        )

        # Override FastAPI dependencies
        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[get_db] = override_get_db
        main.app.dependency_overrides[main.get_vector_index] = lambda: self.vector_store
        main.app.dependency_overrides[main.get_embeddings] = lambda: self.mock_embedder

        self.client = TestClient(main.app)

        # Create primary test notebook
        nb_res = self.client.post("/api/notebooks", json={"title": "Primary Test Notebook"})
        self.assertEqual(nb_res.status_code, 201)
        self.nb_id = nb_res.json()["id"]

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_01_semantic_retrieval_success(self):
        """1. Semantically related queries retrieve relevant passages with metadata."""
        src1 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Quantum Computation",
            "content": "# Principles\n\nSuperposition and quantum entanglement provide computational speedup.",
            "source_type": "txt"
        }).json()

        src2 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Culinary Baking",
            "content": "# Recipe\n\nSourdough bread requires flour, water, salt and active yeast fermentation.",
            "source_type": "txt"
        }).json()

        # Query relevant to quantum computation
        search_res = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "quantum entanglement and superposition",
            "top_k": 4
        })
        self.assertEqual(search_res.status_code, 200)
        data = search_res.json()
        self.assertEqual(data["query"], "quantum entanglement and superposition")
        self.assertEqual(data["notebook_id"], self.nb_id)
        self.assertGreater(data["total_results"], 0)

        top_match = data["results"][0]
        self.assertEqual(top_match["source_id"], src1["id"])
        self.assertEqual(top_match["source_title"], "Quantum Computation")
        self.assertIn("superposition and quantum entanglement", top_match["passage"].lower())
        self.assertGreater(top_match["similarity_score"], 0.0)
        self.assertEqual(top_match["notebook_id"], self.nb_id)
        self.assertEqual(top_match["section_name"], "Principles")

    def test_02_notebook_isolation_strict(self):
        """2. Notebook A cannot retrieve Notebook B's sources even with identical queries."""
        nb_b = self.client.post("/api/notebooks", json={"title": "Notebook B"}).json()["id"]

        # Ingest in Notebook A
        src_a = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Notebook A Machine Learning",
            "content": "Gradient descent minimizes objective loss in deep neural networks.",
            "source_type": "txt"
        }).json()

        # Ingest in Notebook B
        src_b = self.client.post(f"/api/notebooks/{nb_b}/sources", json={
            "title": "Notebook B Machine Learning",
            "content": "Gradient descent minimizes objective loss in deep neural networks.",
            "source_type": "txt"
        }).json()

        # Search Notebook A: must only contain src_a
        res_a = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "gradient descent loss"
        }).json()
        source_ids_in_a = [r["source_id"] for r in res_a["results"]]
        self.assertIn(src_a["id"], source_ids_in_a)
        self.assertNotIn(src_b["id"], source_ids_in_a)

        # Search Notebook B: must only contain src_b
        res_b = self.client.post(f"/api/notebooks/{nb_b}/search", json={
            "query": "gradient descent loss"
        }).json()
        source_ids_in_b = [r["source_id"] for r in res_b["results"]]
        self.assertIn(src_b["id"], source_ids_in_b)
        self.assertNotIn(src_a["id"], source_ids_in_b)

    def test_03_source_deletion_removes_stale_vectors(self):
        """3. Deleting a source removes its vectors from search results."""
        src = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Ephemeral Physics",
            "content": "Special relativity posits that the speed of light is invariant.",
            "source_type": "txt"
        }).json()
        src_id = src["id"]

        # Confirm searchable
        res1 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "speed of light relativity"
        }).json()
        self.assertGreater(res1["total_results"], 0)

        # Delete source
        del_res = self.client.delete(f"/api/notebooks/{self.nb_id}/sources/{src_id}")
        self.assertEqual(del_res.status_code, 200)

        # Search again: must be empty
        res2 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "speed of light relativity"
        }).json()
        self.assertEqual(res2["total_results"], 0)
        self.assertEqual(len(res2["results"]), 0)

    def test_04_notebook_deletion_cleans_vectors(self):
        """4. Deleting a notebook removes all associated vectors."""
        nb_temp = self.client.post("/api/notebooks", json={"title": "Temporary Notebook"}).json()["id"]

        self.client.post(f"/api/notebooks/{nb_temp}/sources", json={
            "title": "Temp Source",
            "content": "Temporary content destined for deletion.",
            "source_type": "txt"
        })

        self.assertGreater(self.vector_store.count_chunks(notebook_id=nb_temp), 0)

        # Delete notebook
        del_nb = self.client.delete(f"/api/notebooks/{nb_temp}")
        self.assertEqual(del_nb.status_code, 200)

        # Confirm vectors for temp notebook are gone
        self.assertEqual(self.vector_store.count_chunks(notebook_id=nb_temp), 0)

    def test_05_reindexing_idempotency_no_duplicates(self):
        """5. Re-indexing does not duplicate vectors or degrade search accuracy."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Astrophysics",
            "content": "Neutron stars possess intense gravitational and magnetic fields.\n\nPulsars emit periodic electromagnetic radiation.",
            "source_type": "txt"
        })

        initial_count = self.vector_store.count_chunks(notebook_id=self.nb_id)
        self.assertGreater(initial_count, 0)

        # Trigger reindex via API
        reindex_res = self.client.post(f"/api/notebooks/{self.nb_id}/reindex")
        self.assertEqual(reindex_res.status_code, 200)
        reindex_data = reindex_res.json()
        self.assertEqual(reindex_data["status"], "success")
        self.assertEqual(reindex_data["notebook_id"], self.nb_id)
        self.assertEqual(reindex_data["indexed_chunks"], initial_count)

        # Chunk count must not double
        post_count = self.vector_store.count_chunks(notebook_id=self.nb_id)
        self.assertEqual(post_count, initial_count)

        # Search must return exactly expected results without duplicate items
        search_res = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "pulsars electromagnetic radiation"
        }).json()
        chunk_ids = [r["chunk_id"] for r in search_res["results"]]
        self.assertEqual(len(chunk_ids), len(set(chunk_ids)), "Duplicate chunk IDs found in search results!")

    def test_06_reject_empty_and_invalid_queries(self):
        """6. Rejects empty, whitespace, and malformed queries with 422 Unprocessable Entity."""
        # Empty query string
        res1 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={"query": ""})
        self.assertEqual(res1.status_code, 422)

        # Whitespace-only query
        res2 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={"query": "    "})
        self.assertEqual(res2.status_code, 422)

        # Missing query field
        res3 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={})
        self.assertEqual(res3.status_code, 422)

        # Invalid top_k
        res4 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "valid query",
            "top_k": 0
        })
        self.assertEqual(res4.status_code, 422)

        # Invalid threshold > 1.0
        res5 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "valid query",
            "threshold": 1.5
        })
        self.assertEqual(res5.status_code, 422)

    def test_07_unknown_notebook_returns_404(self):
        """7. Return 404 for unknown notebook search and reindex requests."""
        res_search = self.client.post("/api/notebooks/nb-nonexistent-404/search", json={
            "query": "valid query"
        })
        self.assertEqual(res_search.status_code, 404)

        res_reindex = self.client.post("/api/notebooks/nb-nonexistent-404/reindex")
        self.assertEqual(res_reindex.status_code, 404)

    def test_08_threshold_filtering(self):
        """8. Similarity threshold filters out low-relevance results."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Aerodynamics",
            "content": "Lift and drag are aerodynamic forces acting on an airfoil.",
            "source_type": "txt"
        })

        # Impossibly high threshold
        res_high = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "aerodynamic lift and drag forces",
            "threshold": 0.999
        }).json()
        self.assertEqual(res_high["total_results"], 0)

        # Normal threshold
        res_norm = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "aerodynamic lift and drag forces",
            "threshold": 0.1
        }).json()
        self.assertGreater(res_norm["total_results"], 0)

    def test_09_selected_source_ids_filtering(self):
        """9. Selected source IDs restrict retrieval to specified sources."""
        src1 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source 1",
            "content": "Distributed consensus algorithms ensure state machine replication.",
            "source_type": "txt"
        }).json()

        src2 = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Source 2",
            "content": "Byzantine fault tolerance tolerates arbitrary node failures in consensus.",
            "source_type": "txt"
        }).json()

        # Restrict to Source 1
        res1 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "consensus algorithms replication",
            "selected_source_ids": [src1["id"]]
        }).json()
        for item in res1["results"]:
            self.assertEqual(item["source_id"], src1["id"])

        # Restrict to Source 2
        res2 = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "consensus algorithms replication",
            "selected_source_ids": [src2["id"]]
        }).json()
        for item in res2["results"]:
            self.assertEqual(item["source_id"], src2["id"])

    def test_10_rebuild_from_sqlite_after_vector_store_loss(self):
        """10. Vector index can be fully reconstructed from persisted SQLite chunks."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Database Systems",
            "content": "Write-ahead logging guarantees atomicity and durability in ACID transactions.",
            "source_type": "txt"
        })

        # Confirm searchable initially
        res_before = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "write-ahead logging durability"
        }).json()
        self.assertGreater(res_before["total_results"], 0)

        # Simulate vector store loss by wiping collection
        self.vector_store.reset()
        self.assertEqual(self.vector_store.count_chunks(notebook_id=self.nb_id), 0)

        # Search now returns nothing
        res_lost = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "write-ahead logging durability"
        }).json()
        self.assertEqual(res_lost["total_results"], 0)

        # Trigger reindex rebuild
        rebuild_res = self.client.post(f"/api/notebooks/{self.nb_id}/reindex")
        self.assertEqual(rebuild_res.status_code, 200)
        self.assertGreater(rebuild_res.json()["indexed_chunks"], 0)

        # Search works again
        res_after = self.client.post(f"/api/notebooks/{self.nb_id}/search", json={
            "query": "write-ahead logging durability"
        }).json()
        self.assertGreater(res_after["total_results"], 0)
        self.assertEqual(res_after["results"][0]["source_title"], "Database Systems")

    def test_11_persistence_across_restart(self):
        """11. Vector store persists embeddings across client/process recreation."""
        self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Thermodynamics",
            "content": "Entropy of an isolated system never decreases over time.",
            "source_type": "txt"
        })

        count_before = self.vector_store.count_chunks(notebook_id=self.nb_id)
        self.assertGreater(count_before, 0)

        # Create a new PersistentVectorStore instance pointing to the same persist_dir
        restarted_store = PersistentVectorStore(
            persist_dir=str(self.vector_dir),
            embedding_service=self.mock_embedder
        )

        count_after = restarted_store.count_chunks(notebook_id=self.nb_id)
        self.assertEqual(count_after, count_before)

        # Verify search through restarted store
        results = restarted_store.search(
            notebook_id=self.nb_id,
            query="isolated system entropy"
        )
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["source_title"], "Thermodynamics")

    def test_12_indexing_failure_preserves_sqlite_data(self):
        """12. Index failures do not lose original source or chunks from SQLite."""
        # Mock vector store index_chunks to raise an exception
        failing_vector_store = MagicMock()
        failing_vector_store.index_chunks.side_effect = RuntimeError("Disk full / ChromaDB failure")

        main.app.dependency_overrides[main.get_vector_index] = lambda: failing_vector_store

        # Create source
        res = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Critical Preserved Source",
            "content": "This content must survive in SQLite even if vector indexing fails.",
            "source_type": "txt"
        })
        self.assertEqual(res.status_code, 201)
        src_id = res.json()["id"]

        # Verify SQLite still has the source and chunks
        db = self.TestingSessionLocal()
        source_in_db = db.query(models.Source).filter(models.Source.id == src_id).first()
        self.assertIsNotNone(source_in_db)
        self.assertEqual(source_in_db.title, "Critical Preserved Source")
        self.assertGreater(len(source_in_db.chunks), 0)
        db.close()


if __name__ == "__main__":
    unittest.main()
