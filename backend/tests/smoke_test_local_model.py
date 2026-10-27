"""
Orion Real Local Model Smoke Test (Phase 6A)
Executes end-to-end embedding generation and vector search using the real
local SentenceTransformer model ('all-MiniLM-L6-v2') on Apple Silicon / CPU.

Run with:
    python3 backend/tests/smoke_test_local_model.py
"""
import os
import sys
import time
import tempfile
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Ensure real embeddings are used for the smoke test
if "ORION_USE_MOCK_EMBEDDINGS" in os.environ:
    del os.environ["ORION_USE_MOCK_EMBEDDINGS"]

from embedding import SentenceTransformerEmbeddingService
from vector_store import PersistentVectorStore


def run_smoke_test():
    print("=" * 70)
    print("Orion Real Local Model Smoke Test: all-MiniLM-L6-v2 + ChromaDB")
    print("=" * 70)

    start_time = time.time()

    # 1. Initialize real embedding service
    print("\n[1/5] Initializing local SentenceTransformerEmbeddingService...")
    embedder = SentenceTransformerEmbeddingService()
    print(f"      Model:  {embedder.model_name}")
    print(f"      Device: {embedder.device}")
    
    t0 = time.time()
    query_text = "quantum entanglement and superposition principles"
    query_emb = embedder.embed_query(query_text)
    embed_duration = time.time() - t0
    print(f"      Embedding dimension: {len(query_emb)}")
    print(f"      Query embedding latency: {embed_duration * 1000:.2f} ms")
    assert len(query_emb) == 384, f"Expected 384 dims, got {len(query_emb)}"

    # 2. Setup isolated temporary vector store
    with tempfile.TemporaryDirectory() as temp_dir:
        vector_dir = Path(temp_dir) / "smoke_vector_store"
        print(f"\n[2/5] Initializing PersistentVectorStore at {vector_dir}...")
        store = PersistentVectorStore(
            persist_dir=str(vector_dir),
            embedding_service=embedder
        )

        # 3. Index sample source passages
        print("\n[3/5] Indexing sample documents...")
        doc1_chunks = [
            {
                "id": "chk-quantum-1",
                "chunk_index": 0,
                "text_content": (
                    "Quantum computing leverages superposition and quantum entanglement to achieve "
                    "exponential speedups for specific classes of computational problems like Shor's algorithm."
                ),
                "section_name": "Quantum Overview",
                "page_number": 1
            }
        ]
        doc2_chunks = [
            {
                "id": "chk-baking-1",
                "chunk_index": 0,
                "text_content": (
                    "Artisan sourdough bread fermentation relies on wild Saccharomyces yeast and lactobacilli "
                    "flour hydration, temperature regulation, and proper proofing stages."
                ),
                "section_name": "Baking Science",
                "page_number": 1
            }
        ]

        store.index_chunks(doc1_chunks, notebook_id="nb-smoke-1", source_id="src-q", source_title="Quantum Physics")
        store.index_chunks(doc2_chunks, notebook_id="nb-smoke-1", source_id="src-b", source_title="Baking Science")

        total_indexed = store.count_chunks(notebook_id="nb-smoke-1")
        print(f"      Indexed chunks in notebook: {total_indexed}")
        assert total_indexed == 2, f"Expected 2 chunks, got {total_indexed}"

        # 4. Perform semantic similarity search
        print("\n[4/5] Executing semantic search...")
        print(f"      Query: '{query_text}'")
        search_results = store.search(
            notebook_id="nb-smoke-1",
            query=query_text,
            top_k=2
        )

        for i, res in enumerate(search_results, 1):
            print(f"      Rank {i}: [{res['source_title']}] (Score: {res['similarity_score']:.4f})")
            print(f"              Passage: \"{res['passage'][:90]}...\"")

        assert len(search_results) == 2, "Expected 2 search results"
        top_match = search_results[0]
        assert top_match["source_id"] == "src-q", f"Expected top match to be Quantum, got {top_match['source_id']}"
        assert top_match["similarity_score"] > 0.5, f"Expected similarity > 0.5, got {top_match['similarity_score']}"
        assert search_results[0]["similarity_score"] > search_results[1]["similarity_score"] + 0.3, "Clear semantic separation failed"

        # 5. Verify source deletion
        print("\n[5/5] Testing source deletion and notebook isolation...")
        store.delete_source("src-q")
        results_after_del = store.search(notebook_id="nb-smoke-1", query=query_text, top_k=2)
        print(f"      Results after deleting Quantum source: {len(results_after_del)}")
        assert len(results_after_del) == 1
        assert results_after_del[0]["source_id"] == "src-b"

        # Notebook isolation test
        results_other_nb = store.search(notebook_id="nb-smoke-2", query=query_text, top_k=2)
        print(f"      Results for non-existent notebook: {len(results_other_nb)}")
        assert len(results_other_nb) == 0

    total_time = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"SMOKE TEST PASSED! All assertions verified in {total_time:.2f} seconds.")
    print("=" * 70)


if __name__ == "__main__":
    run_smoke_test()
