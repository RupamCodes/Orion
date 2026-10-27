"""
Orion Phase 6C Regression Test Suite: Retrieval Accuracy & Citation Grounding
Tests:
1. The exact final-revision-points question at the end of Module V.
2. A straightforward question whose answer is present in the document.
3. A question about information not present in the document (refusal without fake citations).
4. Citation-to-chunk integrity, snippet grounding, and metadata survival.
5. Strict notebook and selected-source isolation under hybrid search.
6. Semantic chunking with page extraction, section extraction, and clean word-boundary overlap.
"""
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Default to offline mock embeddings and mock ollama for fast deterministic unit tests
os.environ["ORION_USE_MOCK_EMBEDDINGS"] = "1"
os.environ["ORION_USE_MOCK_OLLAMA"] = "1"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import main
from embedding import MockEmbeddingService
from vector_store import PersistentVectorStore
from ollama_client import MockOllamaClient
from rag_engine import SemanticChunker


MODULE_V_NOTE_TEXT = (
    "Module V: NLP, LLMs, Generative AI & RAG – Study Notes Page 1\n\n"
    "1. Basics of Natural Language Processing\n\n"
    "Natural language processing bridges human language and machine understanding through statistical models.\n\n"
    "Module V: NLP, LLMs, Generative AI & RAG – Study Notes Page 6\n\n"
    "2. Text Preprocessing\n\n"
    "Preprocessing cleans raw text using lowercase, punctuation removal, tokenization, stop words, and stemming or lemmatization.\n\n"
    "Module V: NLP, LLMs, Generative AI & RAG – Study Notes Page 10\n\n"
    "3. Tokenization and Subword Methods\n\n"
    "Tokenization splits text into units. LLMs use subword tokenization (BPE, WordPiece, SentencePiece) to handle rare words and manage vocabulary size.\n\n"
    "Module V: NLP, LLMs, Generative AI & RAG – Study Notes Page 25\n\n"
    "4. Transformers and Attention\n\n"
    "Transformers rely on self-attention softmax(QK^T / sqrt(d))V to connect all tokens in parallel. BERT handles understanding, while GPT specializes in generation.\n\n"
    "Module V: NLP, LLMs, Generative AI & RAG – Study Notes Page 45\n\n"
    "REMEMBER | Final Revision Points • Preprocessing (lowercase, punctuation, tokenization, stop words, stemming/lemmatization) cleans raw text; BoW, TF - IDF and embeddings turn it into numbers. "
    "• Tokenization splits text into sentences, words, subwords or characters; LLMs use subword methods (BPE, WordPiece, SentencePiece) to handle rare words. "
    "• NLTK offers individual tools for learning; spaCy runs a full pipeline (tokens, POS, lemmas, dependencies, entities) in one call. "
    "• NLP evolved from rules → statistics → ML → RNN/LSTM → Transformers → LLMs, driven by data, compute and better architectures. "
    "• Transformers use self - attention, softmax(QK ᵀ / √dₖ)V, to connect every word with every other word in parallel; BERT understands, GPT generates. "
    "• LLMs are pre - trained by next - token prediction, then instruction - tuned and aligned; they can hallucinate. "
    "• Generative AI creates new text, images, audio and code; it must be used responsibly. "
    "• RAG = Retrieve relevant chunks + Augment the prompt + Generate a grounded answer – up - to - date, private and fewer hallucinations, without retraining."
)


class TestRetrievalGroundingRegression(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_regression.db"
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

        # Create primary test notebook
        nb_res = self.client.post("/api/notebooks", json={"title": "Module V Research Notebook"})
        self.assertEqual(nb_res.status_code, 201)
        self.nb_id = nb_res.json()["id"]

        # Ingest Module V Study Notes
        src_res = self.client.post(f"/api/notebooks/{self.nb_id}/sources", json={
            "title": "Module 5 Notes.pdf",
            "content": MODULE_V_NOTE_TEXT,
            "source_type": "pdf"
        })
        self.assertEqual(src_res.status_code, 201)
        self.source = src_res.json()

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_01_final_revision_points_exact_retrieval(self):
        """1. Final revision points question retrieves the exact final section on Page 45."""
        query = (
            "List the eight final revision points at the end of Module V, "
            "preserving their meaning and order. Cite the source passage for each point."
        )

        search_results = self.vector_store.search(
            notebook_id=self.nb_id,
            query=query,
            top_k=4,
            embedding_service=self.mock_embedder
        )

        self.assertGreater(len(search_results), 0)
        top_match = search_results[0]

        # Verify the top match contains the final revision points section
        self.assertIn("REMEMBER | Final Revision Points", top_match["passage"])
        self.assertIn("Preprocessing", top_match["passage"])
        self.assertIn("RAG = Retrieve relevant chunks", top_match["passage"])
        self.assertEqual(top_match["page_number"], 45)
        self.assertEqual(top_match["section_name"], "REMEMBER | Final Revision Points")

        # Configure deterministic mock LLM to respond grounded in the retrieved passage
        self.mock_ollama.simulated_response = (
            "Here are the eight final revision points at the end of Module V, in order:\n\n"
            "1. Preprocessing cleans raw text; BoW, TF-IDF and embeddings turn it into numbers. [1]\n"
            "2. Tokenization splits text into sentences, words, subwords or characters; LLMs use subword methods to handle rare words. [1]\n"
            "3. NLTK offers individual tools for learning; spaCy runs a full pipeline in one call. [1]\n"
            "4. NLP evolved from rules to transformers and LLMs. [1]\n"
            "5. Transformers use self-attention softmax(QK^T / sqrt(d))V; BERT understands, GPT generates. [1]\n"
            "6. LLMs are pre-trained by next-token prediction, instruction-tuned and aligned. [1]\n"
            "7. Generative AI creates new text, images, audio and code; must be used responsibly. [1]\n"
            "8. RAG = Retrieve relevant chunks + Augment prompt + Generate grounded answer. [1]"
        )

        chat_res = self.client.post(f"/api/notebooks/{self.nb_id}/chat", json={
            "message": query
        })
        self.assertEqual(chat_res.status_code, 200)
        data = chat_res.json()

        # Check citations
        self.assertEqual(len(data["citations"]), 1)
        cit = data["citations"][0]
        self.assertEqual(cit["index"], 1)
        self.assertEqual(cit["source_id"], self.source["id"])
        self.assertEqual(cit["page_number"], 45)
        self.assertEqual(cit["section_name"], "REMEMBER | Final Revision Points")
        self.assertIn("REMEMBER | Final Revision Points", cit["snippet"])

    def test_02_straightforward_question_retrieval(self):
        """2. Straightforward question about tokenization retrieves the tokenization passage."""
        query = "What is tokenization and why do LLMs use subwords?"

        search_results = self.vector_store.search(
            notebook_id=self.nb_id,
            query=query,
            top_k=2,
            embedding_service=self.mock_embedder
        )

        self.assertGreater(len(search_results), 0)
        retrieved_text = " ".join(r["passage"] for r in search_results)
        self.assertIn("Tokenization splits text into units", retrieved_text)
        self.assertIn("subword", retrieved_text.lower())

    def test_03_unanswerable_question_insufficient_evidence_no_citations(self):
        """3. Question about unmentioned information returns clear refusal without citations."""
        unrelated_query = "What are the final revision points of Module 99?"

        self.mock_ollama.simulated_response = (
            "The provided sources do not contain sufficient information to answer this question. "
            "There is no mention of Module 99 in the provided source passages."
        )

        chat_res = self.client.post(f"/api/notebooks/{self.nb_id}/chat", json={
            "message": unrelated_query
        })
        self.assertEqual(chat_res.status_code, 200)
        data = chat_res.json()

        self.assertIn("do not contain sufficient information", data["answer"].lower())
        # Refusal must have 0 citations
        self.assertEqual(len(data["citations"]), 0)

    def test_04_citation_to_chunk_integrity(self):
        """4. Every returned citation maps accurately to a retrieved chunk with valid metadata."""
        query = "What is self-attention in transformers?"

        self.mock_ollama.simulated_response = (
            "Transformers rely on self-attention softmax(QK^T / sqrt(d))V to connect all tokens in parallel [1]."
        )

        chat_res = self.client.post(f"/api/notebooks/{self.nb_id}/chat", json={
            "message": query
        })
        self.assertEqual(chat_res.status_code, 200)
        data = chat_res.json()

        self.assertGreater(len(data["citations"]), 0)
        for cit in data["citations"]:
            self.assertEqual(cit["source_id"], self.source["id"])
            self.assertIsNotNone(cit["chunk_id"])
            self.assertIsNotNone(cit["chunk_index"])
            self.assertGreater(len(cit["snippet"]), 0)
            # Verify snippet appears in the original document content
            self.assertIn(cit["snippet"][:40], MODULE_V_NOTE_TEXT)

    def test_05_notebook_and_selected_source_isolation(self):
        """5. Notebook isolation and selected-source filtering under hybrid search."""
        # Create second notebook with distinct text
        nb2_res = self.client.post("/api/notebooks", json={"title": "Notebook Two"})
        nb2_id = nb2_res.json()["id"]

        self.client.post(f"/api/notebooks/{nb2_id}/sources", json={
            "title": "Astrophysics.txt",
            "content": "Stellar nucleosynthesis fuses hydrogen into helium inside star cores.",
            "source_type": "txt"
        })

        # Query Notebook 1 for astrophysics
        results_nb1 = self.vector_store.search(
            notebook_id=self.nb_id,
            query="stellar nucleosynthesis hydrogen into helium",
            top_k=4,
            embedding_service=self.mock_embedder
        )
        for r in results_nb1:
            self.assertEqual(r["notebook_id"], self.nb_id)
            self.assertNotIn("stellar nucleosynthesis", r["passage"].lower())

        # Query Notebook 2 for astrophysics
        results_nb2 = self.vector_store.search(
            notebook_id=nb2_id,
            query="stellar nucleosynthesis hydrogen into helium",
            top_k=4,
            embedding_service=self.mock_embedder
        )
        self.assertGreater(len(results_nb2), 0)
        self.assertIn("stellar nucleosynthesis", results_nb2[0]["passage"].lower())

    def test_06_chunker_metadata_and_word_boundary_overlap(self):
        """6. SemanticChunker extracts page & section headers and avoids chopping words in overlap."""
        text = (
            "Module V Study Notes Page 12\n\n"
            "REMEMBER | Core Architecture Rules\n\n"
            "The quick brown fox jumps over the lazy dog. " * 15 + "\n\n"
            "Module V Study Notes Page 13\n\n"
            "Section 5 Advanced Modeling\n\n"
            "Knowledge at query time remains unchanged while weights update."
        )

        chunks = SemanticChunker.chunk_text(
            text=text,
            chunk_size=300,
            overlap=60,
            source_id="test-src",
            source_title="Test Document"
        )

        self.assertGreater(len(chunks), 1)
        # Check that page metadata is tracked
        pages_detected = [c["metadata"].get("page") for c in chunks if c["metadata"].get("page")]
        self.assertIn(12, pages_detected)

        # Check section metadata
        sections = [c["metadata"].get("section") for c in chunks]
        self.assertTrue(any("Core Architecture Rules" in s or "Section 5" in s for s in sections))

        # Check that overlap text does not begin with whitespace or empty
        for i in range(1, len(chunks)):
            first_word = chunks[i]["text"].split()[0]
            # Ensure it starts with a clean word
            self.assertTrue(len(first_word) >= 1 and first_word.isalnum())


if __name__ == "__main__":
    unittest.main()
