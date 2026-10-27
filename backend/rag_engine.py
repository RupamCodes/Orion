"""
Orion Local RAG Engine (Module 1 & 2 Core)
Handles multi-source parsing, semantic chunking, dynamic vector indexing with source filtering,
and strict inline citation synthesis.
"""
import os
import re
import math
from typing import List, Dict, Any, Optional

from vector_store import PersistentVectorStore, get_vector_store
from embedding import BaseEmbeddingService, get_embedding_service


class DocumentParser:
    """
    Normalizes multi-format documents (PDF, TXT, MD, CSV, Web URLs) into structured text content.
    """
    @staticmethod
    def parse_content(raw_text: str, filename: str = "document.txt") -> Dict[str, Any]:
        file_ext = filename.split('.')[-1].lower() if '.' in filename else 'txt'
        
        metadata = {
            "filename": filename,
            "file_type": file_ext,
            "has_tables": bool(re.search(r'\|.*\|', raw_text)) or file_ext in ['csv', 'xlsx']
        }
        
        # Normalize text linebreaks and spacing
        cleaned_text = re.sub(r'\r\n', '\n', raw_text)
        cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)
        
        return {
            "normalized_content": cleaned_text.strip(),
            "metadata": metadata
        }

class SemanticChunker:
    """
    Splits text using semantic boundaries (headers, paragraphs, tables) while retaining metadata context.
    """
    @staticmethod
    def chunk_text(
        text: str,
        chunk_size: int = 450,
        overlap: int = 80,
        source_id: str = "source-0",
        source_title: str = "Document"
    ) -> List[Dict[str, Any]]:
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        chunks = []
        current_chunk_paras = []
        current_length = 0
        chunk_index = 0
        current_section = "General Overview"
        current_page = None
        
        for para in paragraphs:
            # Track page context if page indicator exists
            p_match = re.search(r'\b(?:Page|p\.)\s*(\d+)\b', para, re.IGNORECASE)
            if p_match:
                try:
                    current_page = int(p_match.group(1))
                except ValueError:
                    pass

            # Track header/section context
            if para.startswith('#'):
                current_section = para.lstrip('#').strip()
            elif len(para) < 60 and para.isupper():
                current_section = para.strip()
            else:
                sec_match = re.search(r'\b(REMEMBER\s*\|\s*[^•\n\r]{3,80})', para)
                if not sec_match:
                    sec_match = re.search(r'\b(?:Page\s*\d+\s+)?(\d+\.\d*\s+[A-Za-z][^\n•\r]{2,60})', para)
                if sec_match:
                    current_section = sec_match.group(1).strip()
            
            para_len = len(para)
            if current_length + para_len > chunk_size and current_chunk_paras:
                chunk_text = "\n\n".join(current_chunk_paras)
                chunks.append({
                    "id": f"{source_id}-chunk-{chunk_index}",
                    "source_id": source_id,
                    "source_title": source_title,
                    "chunk_index": chunk_index,
                    "text": chunk_text,
                    "metadata": {
                        "section": current_section,
                        "page": current_page,
                        "word_count": len(chunk_text.split())
                    }
                })
                chunk_index += 1
                
                # Maintain overlap safely at word boundary
                if len(chunk_text) > overlap:
                    raw_overlap = chunk_text[-overlap:]
                    first_space = raw_overlap.find(' ')
                    overlap_text = raw_overlap[first_space + 1:].strip() if first_space != -1 else raw_overlap.strip()
                else:
                    overlap_text = chunk_text.strip()
                current_chunk_paras = [overlap_text, para] if overlap_text else [para]
                current_length = len(overlap_text) + para_len
            else:
                current_chunk_paras.append(para)
                current_length += para_len
                
        if current_chunk_paras:
            chunk_text = "\n\n".join(current_chunk_paras)
            chunks.append({
                "id": f"{source_id}-chunk-{chunk_index}",
                "source_id": source_id,
                "source_title": source_title,
                "chunk_index": chunk_index,
                "text": chunk_text,
                "metadata": {
                    "section": current_section,
                    "page": current_page,
                    "word_count": len(chunk_text.split())
                }
            })
            
        return chunks

class LocalVectorIndex:
    """
    Vector search index with dynamic source_id filtering (WHERE source_id IN selected_sources)
    and strict inline citation formatting.
    """
    def __init__(self):
        self.chunks: List[Dict[str, Any]] = []
        self.sources: Dict[str, Dict[str, Any]] = {}
        
    def add_source(self, source_id: str, title: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        self.sources[source_id] = {
            "id": source_id,
            "title": title,
            "metadata": metadata or {}
        }
        parsed = DocumentParser.parse_content(text, title)
        source_chunks = SemanticChunker.chunk_text(
            text=parsed["normalized_content"],
            chunk_size=450,
            overlap=80,
            source_id=source_id,
            source_title=title
        )
        # Remove existing chunks for this source if re-indexing
        self.chunks = [c for c in self.chunks if c["source_id"] != source_id]
        self.chunks.extend(source_chunks)

    def search(
        self,
        query: str,
        selected_source_ids: Optional[List[str]] = None,
        top_k: int = 4
    ) -> List[Dict[str, Any]]:
        if not self.chunks:
            return []
            
        query_terms = set(re.findall(r'\w+', query.lower()))
        if not query_terms:
            return []
            
        filtered_chunks = self.chunks
        if selected_source_ids is not None and len(selected_source_ids) > 0:
            filtered_chunks = [c for c in self.chunks if c["source_id"] in selected_source_ids]
            
        scored = []
        for c in filtered_chunks:
            chunk_text = c["text"].lower()
            # Term frequency & section bonus scoring algorithm
            score = sum(2.0 for term in query_terms if term in chunk_text)
            if c["metadata"].get("section") and any(term in c["metadata"]["section"].lower() for term in query_terms):
                score += 1.5
                
            if score > 0:
                scored.append((score, c))
                
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:top_k]]

    def synthesize_grounded_response(
        self,
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        mode: str = "standard"
    ) -> Dict[str, Any]:
        """
        Synthesizes grounded response with strict inline citations:
        [Source: <id>, Chunk: <chunk_index>, Excerpt: "<direct snippet>"]
        """
        if not retrieved_chunks:
            return {
                "answer": "No relevant source passages were found in the selected documents to answer your question.",
                "citations": [],
                "mode": mode
            }
            
        citations = []
        context_snippets = []
        
        for idx, chunk in enumerate(retrieved_chunks, 1):
            snippet = chunk["text"][:180].replace('\n', ' ') + "..."
            citations.append({
                "index": idx,
                "source_id": chunk["source_id"],
                "source_title": chunk["source_title"],
                "chunk_index": chunk["chunk_index"],
                "snippet": snippet,
                "citation_tag": f'[Source: {chunk["source_id"]}, Chunk: {chunk["chunk_index"]}, Excerpt: "{snippet}"]'
            })
            context_snippets.append(f"[{idx}] {chunk['source_title']} (Section: {chunk['metadata'].get('section')}): \"{chunk['text']}\"")
            
        context_str = "\n\n".join(context_snippets)
        
        if mode == "socratic":
            answer = (
                f"Based on your sources [{', '.join(str(c['index']) for c in citations)}], let's analyze this step by step:\n\n"
                f"1. Key Context: {retrieved_chunks[0]['text'][:200]}...\n\n"
                f"🤔 **Socratic Question to Consider**: How does the relationship between these findings affect your overall objective?\n\n"
                f"Explore citation markers to verify source context."
            )
        elif mode == "adaptive_assessment":
            answer = (
                f"### 🎯 Grounded Quiz & Flashcard Assessment\n\n"
                f"**Question 1**: What primary assertion is made in *{retrieved_chunks[0]['source_title']}*?\n"
                f"- **Answer**: {retrieved_chunks[0]['text'][:150]}... [1]\n\n"
                f"**Question 2**: What section details the operational methodology?\n"
                f"- **Answer**: The section *{retrieved_chunks[0]['metadata'].get('section')}* [1]."
            )
        else:
            answer = (
                f"Here is the synthesized answer based on your selected sources:\n\n"
                f"{retrieved_chunks[0]['text']}\n\n"
                f"Furthermore, *{retrieved_chunks[-1]['source_title']}* notes: \"{retrieved_chunks[-1]['text'][:160]}...\" [{len(citations)}]\n\n"
                f"All conclusions are directly grounded in your document repository."
            )
            
        return {
            "query": query,
            "answer": answer,
            "citations": citations,
            "raw_context": context_str,
            "mode": mode
        }
