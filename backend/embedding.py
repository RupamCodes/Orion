"""
Orion Local Embedding Service
Provides pluggable local embedding models without paid external API calls.
Supports SentenceTransformers (e.g. all-MiniLM-L6-v2 on Apple Silicon / MPS)
and a deterministic offline MockEmbeddingService for isolated unit tests.
"""
import os
import re
import math
import hashlib
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any


class BaseEmbeddingService(ABC):
    """
    Abstract base interface for embedding generation.
    """

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the dimensionality of the generated vectors."""
        pass

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generates normalized vector embeddings for a list of texts."""
        pass

    def embed_query(self, text: str) -> List[float]:
        """Generates normalized vector embedding for a single search query."""
        if not text:
            raise ValueError("Query text cannot be empty.")
        embeddings = self.embed_texts([text])
        return embeddings[0]


class SentenceTransformerEmbeddingService(BaseEmbeddingService):
    """
    Production local embedding service powered by sentence-transformers.
    Runs 100% locally on the device (supports Apple Silicon MPS acceleration).
    Model weights are downloaded only on initial use and cached locally.
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
        device: Optional[str] = None
    ):
        self.model_name = (
            model_name
            or os.environ.get("ORION_EMBEDDING_MODEL")
            or "all-MiniLM-L6-v2"
        )
        self.device = device or os.environ.get("ORION_EMBEDDING_DEVICE")
        if not self.device:
            try:
                import torch
                if torch.backends.mps.is_available():
                    self.device = "mps"
                elif torch.cuda.is_available():
                    self.device = "cuda"
                else:
                    self.device = "cpu"
            except Exception:
                self.device = "cpu"

        self._model = None
        self._dim = 384  # Default for all-MiniLM-L6-v2

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.model_name, device=self.device)
                if hasattr(self._model, "get_embedding_dimension"):
                    self._dim = self._model.get_embedding_dimension()
                elif hasattr(self._model, "get_sentence_embedding_dimension"):
                    self._dim = self._model.get_sentence_embedding_dimension()
                else:
                    self._dim = 384
            except Exception as e:
                raise RuntimeError(
                    f"Failed to load local embedding model '{self.model_name}' on device '{self.device}': {e}"
                ) from e
        return self._model

    @property
    def dimension(self) -> int:
        if self._model is not None:
            return self._dim
        return 384

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        model = self._get_model()
        # SentenceTransformers encode with unit normalization for cosine similarity
        embeddings = model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False
        )
        return embeddings.tolist()


class MockEmbeddingService(BaseEmbeddingService):
    """
    Deterministic, offline embedding service for automated unit tests.
    Requires no model download, no PyTorch execution, and no internet access.
    Uses hash-based pseudo-semantic feature hashing so similar text tokens
    yield high cosine similarity, while dissimilar text tokens yield low similarity.
    """

    def __init__(
        self,
        dim: int = 384,
        custom_embeddings: Optional[Dict[str, List[float]]] = None
    ):
        self._dim = dim
        self.custom_embeddings = custom_embeddings or {}
        self._dim = dim
        self.custom_embeddings = custom_embeddings or {}

    @property
    def dimension(self) -> int:
        return self._dim

    def _hash_embed(self, text: str) -> List[float]:
        # Clean and extract lowercase tokens
        tokens = re.findall(r"\w+", text.lower())
        vec = [0.0] * self._dim
        if not tokens:
            vec[0] = 1.0
            return vec

        for token in tokens:
            # MD5 hash token into index and sign
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self._dim
            sign = 1.0 if ((h >> 8) & 1) else -1.0
            weight = 1.0 + ((h >> 12) % 5) * 0.2
            vec[idx] += sign * weight

        # Normalize to unit length
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        else:
            vec[0] = 1.0
        return vec

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        results = []
        for text in texts:
            if text in self.custom_embeddings:
                results.append(self.custom_embeddings[text])
            else:
                results.append(self._hash_embed(text))
        return results


# Global singleton instance cache
_default_embedding_service: Optional[BaseEmbeddingService] = None


def get_embedding_service() -> BaseEmbeddingService:
    """
    Returns the active embedding service instance.
    If ORION_USE_MOCK_EMBEDDINGS is set, returns MockEmbeddingService.
    Otherwise returns SentenceTransformerEmbeddingService.
    """
    global _default_embedding_service
    if os.environ.get("ORION_USE_MOCK_EMBEDDINGS") == "1":
        return MockEmbeddingService()

    if _default_embedding_service is None:
        _default_embedding_service = SentenceTransformerEmbeddingService()
    return _default_embedding_service


def set_embedding_service(service: Optional[BaseEmbeddingService]):
    """
    Allows test suites or runtime configs to set the active embedding service.
    """
    global _default_embedding_service
    _default_embedding_service = service
