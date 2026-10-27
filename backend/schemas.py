from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict

VALID_SOURCE_TYPES = {"pdf", "txt", "md", "image_ocr", "url", "youtube", "note"}


# ============================================================================
# Notebook Schemas
# ============================================================================

class NotebookBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the notebook")
    description: Optional[str] = Field(None, max_length=5000, description="Optional notebook description")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Notebook title cannot be empty or only whitespace")
        return trimmed


class NotebookCreate(NotebookBase):
    pass


class NotebookUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="New title of the notebook")
    description: Optional[str] = Field(None, max_length=5000, description="New description of the notebook")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Notebook title cannot be empty or only whitespace")
            return trimmed
        return v


class NotebookResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Source & SourceChunk Schemas
# ============================================================================

class SourceChunkResponse(BaseModel):
    id: str
    source_id: str
    chunk_index: int
    text_content: str
    page_number: Optional[int] = None
    section_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SourceCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Source title / filename")
    content: str = Field(..., min_length=1, max_length=5_000_000, description="Extracted raw text content (bounded)")
    source_type: str = Field("txt", description="Type of source document")
    summary: Optional[str] = Field(None, max_length=10000, description="Optional document summary")
    is_selected: bool = Field(True, description="Whether source is active in retrieval")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional document metadata")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Source title cannot be empty or only whitespace")
        return trimmed

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Source content cannot be empty or only whitespace")
        return trimmed

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if v_clean not in VALID_SOURCE_TYPES:
            raise ValueError(f"Invalid source_type '{v}'. Allowed types: {sorted(list(VALID_SOURCE_TYPES))}")
        return v_clean


class SourceUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    is_selected: Optional[bool] = None
    summary: Optional[str] = Field(None, max_length=10000)
    metadata: Optional[Dict[str, Any]] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Source title cannot be empty or only whitespace")
            return trimmed
        return v


class SourceResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    source_type: str
    raw_content: str
    summary: Optional[str] = None
    word_count: int
    is_selected: bool
    meta_info: Optional[Dict[str, Any]] = None
    chunks: List[SourceChunkResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Semantic Search & Retrieval Schemas
# ============================================================================

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Semantic search query")
    top_k: int = Field(4, ge=1, le=50, description="Maximum number of relevant chunks to retrieve")
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Optional minimum cosine similarity threshold")
    selected_source_ids: Optional[List[str]] = Field(None, description="Optional list of source IDs to restrict search to")

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Query cannot be empty or only whitespace")
        return trimmed


class SearchResultItem(BaseModel):
    chunk_id: str
    source_id: str
    source_title: str
    chunk_index: int
    passage: str
    text_content: str
    page_number: Optional[int] = None
    section_name: Optional[str] = None
    similarity_score: float
    notebook_id: str


class SearchResponse(BaseModel):
    query: str
    notebook_id: str
    total_results: int
    results: List[SearchResultItem]


class ReindexResponse(BaseModel):
    status: str
    notebook_id: Optional[str] = None
    indexed_chunks: int
    message: str


# ============================================================================
# Grounded AI Chat Schemas
# ============================================================================

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="User question or research prompt")
    conversation_id: Optional[str] = Field(None, max_length=64, description="Optional conversation identifier")
    selected_source_ids: Optional[List[str]] = Field(None, description="Optional list of source IDs to restrict grounding to")
    model: Optional[str] = Field(None, max_length=128, description="Optional Ollama model override")
    top_k: int = Field(4, ge=1, le=20, description="Number of relevant chunks to retrieve for grounding context")
    threshold: Optional[float] = Field(0.1, ge=0.0, le=1.0, description="Minimum similarity threshold for grounding passages")

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty or only whitespace")
        return trimmed


class CitationItem(BaseModel):
    index: int = Field(..., description="1-based citation index tag like [1]")
    source_id: str
    source_title: str
    chunk_id: str
    chunk_index: int
    snippet: str
    page_number: Optional[int] = None
    section_name: Optional[str] = None
    similarity_score: float


class ChatResponse(BaseModel):
    answer: str
    citations: List[CitationItem] = []
    conversation_id: Optional[str] = None
    model: str
    notebook_id: str


# ============================================================================
# Persistent Conversation & Message Schemas
# ============================================================================

class ConversationCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="Optional title for the conversation")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            return trimmed if trimmed else "New Conversation"
        return v


class ConversationUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="New title of conversation")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Conversation title cannot be empty or only whitespace")
        return trimmed


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class ConversationDetailResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ConversationMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="User question or research prompt")
    message_id: Optional[str] = Field(None, max_length=64, description="Optional client-side message ID for deduplication")
    selected_source_ids: Optional[List[str]] = Field(None, description="Optional list of source IDs to restrict grounding to")
    model: Optional[str] = Field(None, max_length=128, description="Optional Ollama model override")
    top_k: int = Field(4, ge=1, le=20, description="Number of relevant chunks to retrieve")
    threshold: Optional[float] = Field(0.1, ge=0.0, le=1.0, description="Minimum similarity threshold")

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty or only whitespace")
        return trimmed


class ConversationChatResponse(BaseModel):
    answer: str
    citations: List[CitationItem] = []
    conversation_id: str
    notebook_id: str
    model: str
    user_message: MessageResponse
    assistant_message: MessageResponse


# ============================================================================
# Persistent Studio Artifact Schemas
# ============================================================================

VALID_ARTIFACT_TYPES = {
    "flashcards",
    "mindmap",
    "report",
    "infographic",
    "audio_overview",
    "podcast",  # Accepted alias for audio_overview
}


class ArtifactBase(BaseModel):
    artifact_type: str = Field(..., description="Type of studio artifact (flashcards, mindmap, report, infographic, audio_overview)")
    title: str = Field(..., min_length=1, max_length=255, description="Artifact title")

    @field_validator("artifact_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean == "podcast":
            clean = "audio_overview"
        if clean not in VALID_ARTIFACT_TYPES and clean != "audio_overview":
            raise ValueError(f"Invalid artifact_type '{v}'. Allowed types: {sorted(list(VALID_ARTIFACT_TYPES))}")
        return clean

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Artifact title cannot be empty or whitespace only")
        return trimmed


class ArtifactCreate(ArtifactBase):
    structured_content: Dict[str, Any] = Field(default_factory=dict, description="Structured artifact content (JSON)")
    source_ids: Optional[List[str]] = Field(default_factory=list, description="Associated source document IDs")
    citations: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Grounding citation metadata")
    status: Optional[str] = Field("ready", max_length=32, description="Generation status (ready, generating, failed)")


class ArtifactUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    structured_content: Optional[Dict[str, Any]] = None
    status: Optional[str] = Field(None, max_length=32)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Artifact title cannot be empty or whitespace only")
            return trimmed
        return v


class ArtifactResponse(BaseModel):
    id: str
    notebook_id: str
    artifact_type: str
    title: str
    structured_content: Dict[str, Any]
    source_ids: Optional[List[str]] = []
    citations: Optional[List[Dict[str, Any]]] = []
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArtifactGenerateRequest(BaseModel):
    artifact_type: str = Field(..., description="flashcards, mindmap, report, infographic, or audio_overview")
    title: Optional[str] = Field(None, max_length=255, description="Optional custom title")
    selected_source_ids: Optional[List[str]] = Field(None, description="Optional list of source IDs to limit grounding to")
    focus_prompt: Optional[str] = Field(None, max_length=2000, description="Optional user prompt to steer generation")
    model: Optional[str] = Field(None, max_length=128, description="Optional Ollama model override")
    is_regeneration: Optional[bool] = Field(False, description="Flag indicating fresh regeneration intent")
    regenerate_artifact_id: Optional[str] = Field(None, max_length=64, description="Optional existing artifact ID to replace upon regeneration")

    @field_validator("artifact_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean == "podcast":
            clean = "audio_overview"
        if clean not in VALID_ARTIFACT_TYPES and clean != "audio_overview":
            raise ValueError(f"Invalid artifact_type '{v}'. Allowed types: {sorted(list(VALID_ARTIFACT_TYPES))}")
        return clean


class ArtifactRegenerateRequest(BaseModel):
    focus_prompt: Optional[str] = Field(None, max_length=2000, description="Optional user prompt to steer fresh dialogue")
    model: Optional[str] = Field(None, max_length=128, description="Optional Ollama model override")
    title: Optional[str] = Field(None, max_length=255, description="Optional custom title override")




