import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Integer,
    Boolean,
    JSON,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from database import Base


def generate_notebook_id() -> str:
    return f"nb-{uuid.uuid4().hex[:12]}"


def generate_source_id() -> str:
    return f"src-{uuid.uuid4().hex[:12]}"


def generate_chunk_id() -> str:
    return f"chk-{uuid.uuid4().hex[:12]}"


def generate_conversation_id() -> str:
    return f"conv-{uuid.uuid4().hex[:12]}"


def generate_message_id() -> str:
    return f"msg-{uuid.uuid4().hex[:12]}"


def generate_artifact_id() -> str:
    return f"art-{uuid.uuid4().hex[:12]}"


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(String(36), primary_key=True, default=generate_notebook_id, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(String(64), nullable=False, default="local_user", index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=get_utc_now,
        onupdate=get_utc_now,
        nullable=False,
    )

    # Relationships
    sources = relationship(
        "Source",
        back_populates="notebook",
        cascade="all, delete-orphan",
        order_by="Source.created_at.desc()",
    )
    conversations = relationship(
        "Conversation",
        back_populates="notebook",
        cascade="all, delete-orphan",
        order_by="Conversation.updated_at.desc()",
    )
    artifacts = relationship(
        "Artifact",
        back_populates="notebook",
        cascade="all, delete-orphan",
        order_by="Artifact.updated_at.desc()",
    )

    __table_args__ = (
        Index("ix_notebooks_user_updated", "user_id", "updated_at"),
    )

    def __repr__(self):
        return f"<Notebook(id='{self.id}', title='{self.title}', user_id='{self.user_id}')>"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=generate_conversation_id, index=True)
    notebook_id = Column(
        String(36),
        ForeignKey("notebooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False, default="New Conversation")
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=get_utc_now,
        onupdate=get_utc_now,
        nullable=False,
    )

    # Relationships
    notebook = relationship("Notebook", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at.asc()",
    )

    __table_args__ = (
        Index("ix_conversations_notebook_updated", "notebook_id", "updated_at"),
    )

    def __repr__(self):
        return f"<Conversation(id='{self.id}', notebook_id='{self.notebook_id}', title='{self.title}')>"


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_message_id, index=True)
    conversation_id = Column(
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    citations = Column(JSON, nullable=True, default=list)
    model = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

    __table_args__ = (
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
    )

    def __repr__(self):
        return f"<Message(id='{self.id}', conversation_id='{self.conversation_id}', role='{self.role}')>"


class Source(Base):
    __tablename__ = "sources"

    id = Column(String(36), primary_key=True, default=generate_source_id, index=True)
    notebook_id = Column(
        String(36),
        ForeignKey("notebooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False, default="txt")
    raw_content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    word_count = Column(Integer, nullable=False, default=0)
    # Named meta_info to avoid conflict with SQLAlchemy Base.metadata
    meta_info = Column(JSON, nullable=True, default=dict)
    is_selected = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=get_utc_now,
        onupdate=get_utc_now,
        nullable=False,
    )

    # Relationships
    notebook = relationship("Notebook", back_populates="sources")
    chunks = relationship(
        "SourceChunk",
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="SourceChunk.chunk_index",
    )

    __table_args__ = (
        Index("ix_sources_notebook_created", "notebook_id", "created_at"),
    )

    def __repr__(self):
        return f"<Source(id='{self.id}', notebook_id='{self.notebook_id}', title='{self.title}')>"


class SourceChunk(Base):
    __tablename__ = "source_chunks"

    id = Column(String(36), primary_key=True, default=generate_chunk_id, index=True)
    source_id = Column(
        String(36),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    section_name = Column(String(255), nullable=True)

    # Relationships
    source = relationship("Source", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("source_id", "chunk_index", name="uq_source_chunk_index"),
        Index("ix_source_chunks_source_index", "source_id", "chunk_index"),
    )

    def __repr__(self):
        return f"<SourceChunk(id='{self.id}', source_id='{self.source_id}', index={self.chunk_index})>"


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(String(36), primary_key=True, default=generate_artifact_id, index=True)
    notebook_id = Column(
        String(36),
        ForeignKey("notebooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    artifact_type = Column(String(50), nullable=False)  # 'flashcards', 'mindmap', 'report', 'infographic', 'audio_overview'
    title = Column(String(255), nullable=False)
    structured_content = Column(JSON, nullable=False, default=dict)
    source_ids = Column(JSON, nullable=True, default=list)
    citations = Column(JSON, nullable=True, default=list)
    status = Column(String(32), nullable=False, default="ready")  # 'ready', 'generating', 'failed'
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=get_utc_now,
        onupdate=get_utc_now,
        nullable=False,
    )

    # Relationships
    notebook = relationship("Notebook", back_populates="artifacts")

    __table_args__ = (
        Index("ix_artifacts_notebook_updated", "notebook_id", "updated_at"),
        Index("ix_artifacts_notebook_type", "notebook_id", "artifact_type"),
    )

    def __repr__(self):
        return f"<Artifact(id='{self.id}', notebook_id='{self.notebook_id}', type='{self.artifact_type}', title='{self.title}')>"
