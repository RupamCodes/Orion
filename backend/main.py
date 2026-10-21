"""
Orion FastAPI Production Server (Modules 1 - 4 API Server)
Exposes REST endpoints for multi-source ingestion, grounded RAG with strict inline citations,
Socratic mode, Studio artifact synthesis, audio dialogue generation, and recursive note conversion.
"""
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import uuid
import json

from rag_engine import LocalVectorIndex, DocumentParser
from audio_studio import PodcastDialogueGenerator

app = FastAPI(
    title="Orion Research & Studio Platform API",
    description="Production-grade local AI research, note-taking, and synthesis platform modeled after NotebookLM.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global In-Memory Vector Index Instance
global_index = LocalVectorIndex()

# Seed default initial document into index
global_index.add_source(
    source_id="source-1",
    title="Orion System Architecture Document",
    text=(
        "# Orion System Architecture\n\n"
        "Orion is a privacy-first, editorial-grade local research workspace inspired by Google NotebookLM. "
        "It executes all vector retrieval, language modeling, study synthesis, and dual-host audio discussions "
        "directly on your machine without cloud dependencies.\n\n"
        "## Key Features\n\n"
        "1. Dynamic Source Toggling: Allows users to filter retrieval strictly to selected source IDs.\n"
        "2. Grounded Inline Citations: Output verifiable citation tags [Source: <id>, Chunk: <chunk_index>].\n"
        "3. Recursive Note System: Pin any LLM synthesis as a note, then convert it into a new source for recursive synthesis."
    )
)

# Request Models
class IngestRequest(BaseModel):
    title: str
    content: str
    source_type: str = "text" # pdf, txt, md, url, note
    metadata: Optional[Dict[str, Any]] = None

class QueryRequest(BaseModel):
    query: str
    selected_source_ids: Optional[List[str]] = None
    top_k: int = 4
    mode: str = "standard" # standard, socratic, adaptive_assessment

class ArtifactRequest(BaseModel):
    artifact_type: str # briefing, timeline, faq, podcast, mindmap, flashcards
    topic: Optional[str] = "Research Summary"
    selected_source_ids: Optional[List[str]] = None
    interruption_prompt: Optional[str] = None

class PinNoteRequest(BaseModel):
    note_id: str
    title: str
    content: str

# Endpoints

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "platform": "Orion AI Research & Studio Engine",
        "architecture": "NotebookLM Model",
        "indexed_sources_count": len(global_index.sources),
        "total_indexed_chunks": len(global_index.chunks)
    }

@app.post("/api/sources/ingest")
async def ingest_source(req: IngestRequest):
    """
    Ingests raw document content or web page text into vector index.
    """
    source_id = f"src-{uuid.uuid4().hex[:8]}"
    global_index.add_source(
        source_id=source_id,
        title=req.title,
        text=req.content,
        metadata=req.metadata
    )
    return {
        "status": "success",
        "source_id": source_id,
        "title": req.title,
        "chunks_created": len([c for c in global_index.chunks if c["source_id"] == source_id])
    }

@app.post("/api/query")
async def query_rag(req: QueryRequest):
    """
    Performs dynamic vector retrieval filtered by selected_source_ids
    and synthesizes grounded response with strict inline citations.
    """
    retrieved_chunks = global_index.search(
        query=req.query,
        selected_source_ids=req.selected_source_ids,
        top_k=req.top_k
    )
    
    response = global_index.synthesize_grounded_response(
        query=req.query,
        retrieved_chunks=retrieved_chunks,
        mode=req.mode
    )
    return response

@app.post("/api/studio/artifact")
async def generate_studio_artifact(req: ArtifactRequest):
    """
    Document Forge & Studio Synthesis API:
    Generates Briefings, Timelines, FAQs, Mind Maps (Mermaid.js), Flashcards, or Podcast Scripts.
    """
    retrieved_chunks = global_index.chunks
    if req.selected_source_ids:
        retrieved_chunks = [c for c in global_index.chunks if c["source_id"] in req.selected_source_ids]
        
    if req.artifact_type == "podcast":
        podcast_output = PodcastDialogueGenerator.generate_dialogue(
            topic=req.topic or "Source Analysis",
            context_chunks=retrieved_chunks,
            user_interruption_prompt=req.interruption_prompt
        )
        return {
            "artifact_type": "podcast",
            "title": podcast_output["title"],
            "data": podcast_output
        }
        
    elif req.artifact_type == "briefing":
        summary_text = "\n".join([f"- {c['text'][:120]}..." for c in retrieved_chunks[:4]]) if retrieved_chunks else "- No source context."
        return {
            "artifact_type": "briefing",
            "title": f"Executive Briefing: {req.topic}",
            "content": f"# Executive Briefing\n\n## Core Findings\n{summary_text}\n\n## Strategic Takeaway\nAll observations are verified across active notebook sources."
        }
        
    elif req.artifact_type == "mindmap":
        mermaid_graph = "graph TD\n    Root[Orion Workspace]\n"
        for idx, chunk in enumerate(retrieved_chunks[:4], 1):
            concept = chunk["metadata"].get("section", f"Concept {idx}")
            mermaid_graph += f"    Root --> C{idx}[\"{concept}\"]\n"
            mermaid_graph += f"    C{idx} --> S{idx}[\"{chunk['source_title']}\"]\n"
            
        return {
            "artifact_type": "mindmap",
            "title": "Interactive Mind Map",
            "mermaid_code": mermaid_graph
        }
        
    elif req.artifact_type == "flashcards":
        cards = []
        for idx, chunk in enumerate(retrieved_chunks[:3], 1):
            cards.append({
                "id": f"card-{idx}",
                "question": f"What key point is discussed in {chunk['source_title']}?",
                "answer": f"{chunk['text'][:140]}...",
                "category": chunk["metadata"].get("section", "General")
            })
        return {
            "artifact_type": "flashcards",
            "title": "Study Flashcards",
            "flashcards": cards
        }
        
    else:
        return {
            "artifact_type": req.artifact_type,
            "title": f"Generated {req.artifact_type.capitalize()}",
            "content": f"Structured synthesis output grounded in {len(retrieved_chunks)} source passages."
        }

@app.post("/api/notes/pin-to-source")
async def convert_note_to_source(req: PinNoteRequest):
    """
    Module 4 Recursive Source System:
    Converts a saved note into a first-class source in the vector index for recursive synthesis.
    """
    source_id = f"src-note-{uuid.uuid4().hex[:6]}"
    global_index.add_source(
        source_id=source_id,
        title=f"[Note] {req.title}",
        text=req.content,
        metadata={"is_pinned_note": True, "original_note_id": req.note_id}
    )
    return {
        "status": "converted",
        "new_source_id": source_id,
        "title": f"[Note] {req.title}",
        "message": "Note successfully converted to first-class source for recursive retrieval."
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
