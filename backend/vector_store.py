"""
Orion Persistent Vector Store
Manages persistent local semantic vector indexing and retrieval with ChromaDB.
Enforces strict notebook-scoped isolation, prevents duplicate vectors,
and supports full re-indexing and rebuilding from SQLite.
"""
import os
import re
import math
import logging
from collections import Counter
from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings

from embedding import BaseEmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_VECTOR_DIR = BASE_DIR / "data" / "vector_store"
COLLECTION_NAME = "orion_notebook_chunks"


class PersistentVectorStore:
    """
    Local persistent vector store backed by ChromaDB.
    Guarantees persistence across server restarts and strict notebook isolation.
    """

    def __init__(
        self,
        persist_dir: Optional[str] = None,
        embedding_service: Optional[BaseEmbeddingService] = None,
        collection_name: str = COLLECTION_NAME
    ):
        self.persist_dir = Path(
            persist_dir
            or os.environ.get("ORION_VECTOR_DB_DIR")
            or str(DEFAULT_VECTOR_DIR)
        )
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.collection_name = collection_name
        self.embedding_service = embedding_service or get_embedding_service()

        # Initialize ChromaDB persistent client
        self._client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=Settings(anonymized_telemetry=False)
        )
        # Cosine distance space: distance = 1.0 - cosine_similarity
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )

    def _get_embedding_service(self, override: Optional[BaseEmbeddingService] = None) -> BaseEmbeddingService:
        return override or self.embedding_service or get_embedding_service()

    def index_chunks(
        self,
        chunks: List[Dict[str, Any]],
        notebook_id: str,
        source_id: str,
        source_title: str,
        embedding_service: Optional[BaseEmbeddingService] = None
    ) -> int:
        """
        Indexes a list of text chunks for a given source and notebook.
        Uses upsert to guarantee idempotency and avoid duplicate vectors.
        """
        if not chunks:
            return 0

        embedder = self._get_embedding_service(embedding_service)

        ids: List[str] = []
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for c in chunks:
            chunk_id = c.get("id") or f"{source_id}-chunk-{c.get('chunk_index', 0)}"
            text = c.get("text_content") or c.get("text") or ""
            if not text.strip():
                continue

            chunk_idx = int(c.get("chunk_index", 0))

            meta: Dict[str, Any] = {
                "notebook_id": str(notebook_id),
                "source_id": str(source_id),
                "source_title": str(source_title or ""),
                "chunk_id": str(chunk_id),
                "chunk_index": chunk_idx,
            }

            page_number = c.get("page_number")
            if page_number is not None:
                meta["page_number"] = int(page_number)
            else:
                p_match = re.search(r'\b(?:Page|p\.)\s*(\d+)\b', text, re.IGNORECASE)
                if p_match:
                    try:
                        meta["page_number"] = int(p_match.group(1))
                    except ValueError:
                        pass

            section_name = c.get("section_name")
            if section_name and section_name != "General Overview":
                meta["section_name"] = str(section_name)
            else:
                sec_m = re.search(r'\b(REMEMBER\s*\|\s*[^•\n\r]{3,80})', text)
                if not sec_m:
                    sec_m = re.search(r'\b(?:Page\s*\d+\s+)?(\d+\.\d*\s+[A-Za-z][^\n•\r]{2,60})', text)
                if not sec_m:
                    sec_m = re.search(r'(?:Page\s*\d+\s+)([A-Z][A-Za-z0-9\s\-&]{3,50})', text)
                if sec_m:
                    meta["section_name"] = sec_m.group(1).strip()
                elif section_name:
                    meta["section_name"] = str(section_name)

            ids.append(chunk_id)
            documents.append(text)
            metadatas.append(meta)

        if not ids:
            return 0

        # Generate embeddings locally
        embeddings = embedder.embed_texts(documents)

        # Chroma upsert updates existing chunk IDs or inserts new ones (no duplicates)
        self._collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )

        return len(ids)

    def delete_source(self, source_id: str) -> None:
        """
        Removes all vectors belonging to a deleted source.
        """
        try:
            self._collection.delete(where={"source_id": str(source_id)})
        except Exception as e:
            logger.warning(f"Error deleting vectors for source '{source_id}': {e}")

    def delete_notebook(self, notebook_id: str) -> None:
        """
        Removes all vectors belonging to a deleted notebook.
        """
        try:
            self._collection.delete(where={"notebook_id": str(notebook_id)})
        except Exception as e:
            logger.warning(f"Error deleting vectors for notebook '{notebook_id}': {e}")

    def search(
        self,
        notebook_id: str,
        query: str,
        top_k: int = 4,
        threshold: Optional[float] = None,
        selected_source_ids: Optional[List[str]] = None,
        embedding_service: Optional[BaseEmbeddingService] = None
    ) -> List[Dict[str, Any]]:
        """
        Hybrid retrieval combining local dense vector similarity with lexical BM25,
        phrase matching, and section/positional cue awareness strictly scoped to the notebook.
        Enforces notebook isolation and source filtering.
        """
        trimmed_query = query.strip()
        if not trimmed_query:
            return []

        # Build strict notebook-scoped where filter
        if selected_source_ids:
            clean_ids = [str(sid) for sid in selected_source_ids if str(sid).strip()]
            if len(clean_ids) == 1:
                where_filter = {
                    "$and": [
                        {"notebook_id": str(notebook_id)},
                        {"source_id": clean_ids[0]}
                    ]
                }
            elif len(clean_ids) > 1:
                where_filter = {
                    "$and": [
                        {"notebook_id": str(notebook_id)},
                        {"source_id": {"$in": clean_ids}}
                    ]
                }
            else:
                where_filter = {"notebook_id": str(notebook_id)}
        else:
            where_filter = {"notebook_id": str(notebook_id)}

        # Fetch all scoped candidate documents from Chroma collection
        try:
            scope_items = self._collection.get(
                where=where_filter,
                include=["documents", "metadatas"]
            )
        except Exception as e:
            logger.error(f"Error fetching scoped documents for search: {e}")
            return []

        if not scope_items or not scope_items.get("ids"):
            return []

        all_ids = scope_items["ids"]
        all_docs = scope_items.get("documents", [])
        all_metas = scope_items.get("metadatas", [])
        total_docs = len(all_ids)
        if total_docs == 0:
            return []

        # 1. Dense Semantic Similarity
        embedder = self._get_embedding_service(embedding_service)
        query_vec = embedder.embed_query(trimmed_query)

        fetch_k = min(total_docs, max(top_k * 5, 25))
        dense_sim_map: Dict[str, float] = {}
        dense_rank_map: Dict[str, int] = {}

        try:
            vector_res = self._collection.query(
                query_embeddings=[query_vec],
                n_results=fetch_k,
                where=where_filter,
                include=["distances"]
            )
            if vector_res and vector_res.get("ids") and vector_res["ids"][0]:
                v_ids = vector_res["ids"][0]
                v_dists = vector_res.get("distances", [[]])[0]
                for v_rank, (vid, vdist) in enumerate(zip(v_ids, v_dists)):
                    sim = round(max(-1.0, min(1.0, 1.0 - float(vdist))), 4)
                    dense_sim_map[vid] = sim
                    dense_rank_map[vid] = v_rank
        except Exception as e:
            logger.warning(f"Vector query warning: {e}")

        # 2. Lexical BM25 & Phrase Scoring
        def tokenize(text: str) -> List[str]:
            return re.findall(r'[a-zA-Z0-9]+', text.lower())

        stop_words = {
            'the', 'a', 'an', 'is', 'of', 'and', 'in', 'to', 'for', 'with', 'on', 'at',
            'by', 'their', 'each', 'from', 'as', 'what', 'which', 'how', 'cite', 'source',
            'passage', 'point', 'points', 'list', 'are', 'was', 'were', 'it', 'its', 'be',
            'been', 'this', 'that', 'these', 'those', 'or', 'not', 'all'
        }

        q_lower = trimmed_query.lower()
        q_tokens = [t for t in tokenize(trimmed_query) if t not in stop_words]
        doc_token_lists = [tokenize(doc or "") for doc in all_docs]

        avgdl = (sum(len(dt) for dt in doc_token_lists) / total_docs) if total_docs > 0 else 1.0
        doc_freqs: Dict[str, int] = Counter()
        for dt in doc_token_lists:
            for t in set(dt):
                doc_freqs[t] += 1

        has_end_intent = any(term in q_lower for term in ['end of', 'final', 'last page', 'conclusion', 'closing'])
        has_start_intent = any(term in q_lower for term in ['beginning of', 'first', 'start of', 'intro', 'introduction', 'overview'])

        query_words_clean = [w for w in re.findall(r'\b\w+\b', q_lower) if w not in stop_words]
        phrases_to_match = []
        for w_len in (4, 3, 2):
            for s_idx in range(len(query_words_clean) - w_len + 1):
                phrases_to_match.append((' '.join(query_words_clean[s_idx:s_idx + w_len]), w_len))

        max_chunk_idx = max((int(m.get("chunk_index", 0)) for m in all_metas if m), default=0)

        lexical_score_map: Dict[str, float] = {}

        for i, doc_id in enumerate(all_ids):
            doc_text = all_docs[i] or ""
            dt = doc_token_lists[i]
            dl = len(dt)
            tf_counter = Counter(dt)
            doc_lower = doc_text.lower()
            meta = all_metas[i] or {}

            score = 0.0
            for qt in q_tokens:
                if qt in tf_counter:
                    n_qt = doc_freqs.get(qt, 1)
                    idf = math.log(1.0 + (total_docs - n_qt + 0.5) / (n_qt + 0.5))
                    tf_val = tf_counter[qt]
                    term_score = idf * (tf_val * 2.2) / (tf_val + 1.2 * (0.25 + 0.75 * (dl / avgdl)))
                    score += term_score

            for phrase, w_len in phrases_to_match:
                if phrase in doc_lower:
                    score += 6.0 * w_len

            sec_name = str(meta.get("section_name", "")).lower()
            if sec_name and sec_name != "general overview":
                if any(qt in sec_name for qt in q_tokens):
                    score += 4.0
                for phrase, w_len in phrases_to_match:
                    if phrase in sec_name:
                        score += 5.0 * w_len

            if "remember" in doc_lower and "remember" in q_lower:
                score += 8.0

            chunk_idx = int(meta.get("chunk_index", 0))
            if has_end_intent and max_chunk_idx > 0 and chunk_idx >= max_chunk_idx - 2:
                score += 3.5
            elif has_start_intent and chunk_idx <= 2:
                score += 3.5

            lexical_score_map[doc_id] = score

        lex_sorted_ids = sorted(all_ids, key=lambda did: lexical_score_map[did], reverse=True)
        lexical_rank_map = {did: r for r, did in enumerate(lex_sorted_ids)}

        # 3. Score Fusion & Candidate Construction
        candidates = []
        for i, doc_id in enumerate(all_ids):
            meta = all_metas[i] or {}
            if meta.get("notebook_id") != str(notebook_id):
                continue

            doc_text = all_docs[i] or ""
            d_sim = dense_sim_map.get(doc_id, 0.0)
            d_rank = dense_rank_map.get(doc_id, 999)

            l_sc = lexical_score_map.get(doc_id, 0.0)
            l_rank = lexical_rank_map.get(doc_id, 999)

            if d_sim <= 0.0 and l_sc <= 0.0:
                fused_score = 0.0
            else:
                norm_l = (1.0 - math.exp(-l_sc / 8.0)) if l_sc > 0.0 else 0.0
                rrf = (1.0 / (40.0 + d_rank)) + (1.0 / (40.0 + l_rank))
                combined = 0.45 * max(0.0, d_sim) + 0.45 * norm_l + 0.5 * rrf
                fused_score = round(max(-1.0, min(1.0, combined)), 4)

            # Metadata extraction for page number & section name if missing
            page_number = meta.get("page_number")
            if page_number is None and doc_text:
                p_match = re.search(r'\b(?:Page|p\.)\s*(\d+)\b', doc_text, re.IGNORECASE)
                if p_match:
                    try:
                        page_number = int(p_match.group(1))
                    except ValueError:
                        page_number = None

            section_name = meta.get("section_name")
            if (not section_name or section_name == "General Overview") and doc_text:
                sec_m = re.search(r'\b(REMEMBER\s*\|\s*[^•\n\r]{3,80})', doc_text)
                if not sec_m:
                    sec_m = re.search(r'\b(?:Page\s*\d+\s+)?(\d+\.\d*\s+[A-Za-z][^\n•\r]{2,60})', doc_text)
                if not sec_m:
                    sec_m = re.search(r'(?:Page\s*\d+\s+)([A-Z][A-Za-z0-9\s\-&]{3,50})', doc_text)
                if sec_m:
                    section_name = sec_m.group(1).strip()
                else:
                    section_name = section_name or "General Overview"

            item = {
                "chunk_id": str(meta.get("chunk_id", doc_id)),
                "source_id": str(meta.get("source_id", "")),
                "source_title": str(meta.get("source_title", "")),
                "chunk_index": int(meta.get("chunk_index", 0)),
                "passage": doc_text,
                "text_content": doc_text,
                "page_number": page_number,
                "section_name": section_name,
                "similarity_score": fused_score,
                "notebook_id": str(notebook_id),
            }
            candidates.append(item)

        # Apply similarity threshold if specified
        if threshold is not None:
            candidates = [c for c in candidates if c["similarity_score"] >= threshold]

        # Deduplicate identical passages or chunk IDs
        seen_keys = set()
        unique_candidates = []
        for cand in candidates:
            cand_key = (cand["source_id"], cand["passage"][:120].strip())
            if cand_key not in seen_keys and cand["chunk_id"] not in seen_keys:
                seen_keys.add(cand_key)
                seen_keys.add(cand["chunk_id"])
                unique_candidates.append(cand)

        # Sort descending by similarity score, secondary by chunk_index
        unique_candidates.sort(key=lambda x: (x["similarity_score"], -x["chunk_index"]), reverse=True)
        return unique_candidates[:top_k]

    def count_chunks(self, notebook_id: Optional[str] = None) -> int:
        """
        Returns the count of indexed chunks, optionally scoped to a notebook.
        """
        if notebook_id:
            try:
                res = self._collection.get(where={"notebook_id": str(notebook_id)})
                return len(res.get("ids", []))
            except Exception:
                return 0
        return self._collection.count()

    def rebuild_from_db(
        self,
        db_session,
        notebook_id: Optional[str] = None,
        embedding_service: Optional[BaseEmbeddingService] = None
    ) -> int:
        """
        Reconstructs the vector index from persisted SQLite sources and chunks.
        If notebook_id is given, only rebuilds that notebook's index.
        """
        import models

        if notebook_id:
            self.delete_notebook(notebook_id)
            query = (
                db_session.query(models.Source)
                .filter(models.Source.notebook_id == notebook_id)
                .all()
            )
        else:
            self.reset()
            query = db_session.query(models.Source).all()

        total_indexed = 0
        for src in query:
            chunks_data = []
            for chunk in src.chunks:
                # Backfill page_number and section_name in DB if missing
                if chunk.page_number is None and chunk.text_content:
                    p_match = re.search(r'\b(?:Page|p\.)\s*(\d+)\b', chunk.text_content, re.IGNORECASE)
                    if p_match:
                        try:
                            chunk.page_number = int(p_match.group(1))
                        except ValueError:
                            pass
                if (not chunk.section_name or chunk.section_name == "General Overview") and chunk.text_content:
                    sec_m = re.search(r'\b(REMEMBER\s*\|\s*[^•\n\r]{3,80})', chunk.text_content)
                    if not sec_m:
                        sec_m = re.search(r'\b(?:Page\s*\d+\s+)?(\d+\.\d*\s+[A-Za-z][^\n•\r]{2,60})', chunk.text_content)
                    if not sec_m:
                        sec_m = re.search(r'(?:Page\s*\d+\s+)([A-Z][A-Za-z0-9\s\-&]{3,50})', chunk.text_content)
                    if sec_m:
                        chunk.section_name = sec_m.group(1).strip()

                chunks_data.append({
                    "id": chunk.id,
                    "chunk_index": chunk.chunk_index,
                    "text_content": chunk.text_content,
                    "page_number": chunk.page_number,
                    "section_name": chunk.section_name,
                })
            try:
                db_session.commit()
            except Exception:
                db_session.rollback()

            indexed_count = self.index_chunks(
                chunks=chunks_data,
                notebook_id=src.notebook_id,
                source_id=src.id,
                source_title=src.title,
                embedding_service=embedding_service
            )
            total_indexed += indexed_count

        return total_indexed

    def reset(self) -> None:
        """
        Deletes and recreates the collection. Useful for tests or full re-indexing.
        """
        try:
            self._client.delete_collection(name=self.collection_name)
        except Exception:
            pass
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )


# Global singleton instance cache
_default_vector_store: Optional[PersistentVectorStore] = None


def get_vector_store() -> PersistentVectorStore:
    """
    Returns the active PersistentVectorStore instance.
    """
    global _default_vector_store
    if _default_vector_store is None:
        _default_vector_store = PersistentVectorStore()
    return _default_vector_store


def set_vector_store(store: Optional[PersistentVectorStore]):
    """
    Allows test suites or runtime configs to override the active vector store.
    """
    global _default_vector_store
    _default_vector_store = store
