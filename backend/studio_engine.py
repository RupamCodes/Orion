"""
Orion Studio Artifact Generation Engine
Implements source-grounded artifact synthesis for:
1. Flashcards (front/back study cards with citations and deduplication)
2. Mind Map (hierarchical concept nodes, directed edges, source evidence)
3. Reports (executive summary, structured sections, inline citations, key findings)
4. Infographic (visual specification with grounded stats, takeaways, process steps)
5. Audio Overview (two-host conversational podcast dialogue with Alex & Sam)

Integrates with local Ollama when available, with robust JSON parsing and
guaranteed deterministic grounded fallback when Ollama is offline or times out.
"""
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple

from ollama_client import (
    OllamaClient,
    OllamaError,
    OllamaConnectionError,
    OllamaTimeoutError,
    OllamaModelNotFoundError
)

logger = logging.getLogger(__name__)


class StudioValidationError(Exception):
    """Raised when generated studio artifact fails structure, dialogue, or content validation."""
    pass


def clean_json_string(raw: str) -> str:
    """
    Strips markdown code blocks, backticks, and extraneous text to extract valid JSON.
    """
    text = raw.strip()
    # Match ```json ... ``` or ``` ... ```
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        text = match.group(1).strip()
    else:
        # If no code block, look for first { or [ and last } or ]
        first_curly = text.find('{')
        first_bracket = text.find('[')
        start = -1
        if first_curly != -1 and first_bracket != -1:
            start = min(first_curly, first_bracket)
        elif first_curly != -1:
            start = first_curly
        elif first_bracket != -1:
            start = first_bracket

        last_curly = text.rfind('}')
        last_bracket = text.rfind(']')
        end = max(last_curly, last_bracket)

        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]

    # Clean common trailing commas before closing braces/brackets
    text = re.sub(r',\s*([\]}])', r'\1', text)
    return text


def build_source_context_block(chunks: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Constructs citation metadata and numbered context passages from retrieved chunks.
    """
    citations: List[Dict[str, Any]] = []
    context_lines: List[str] = []

    for idx, c in enumerate(chunks, 1):
        passage = (c.get("passage") or c.get("text_content") or c.get("text") or "").strip()
        snippet = passage[:220].replace("\n", " ").strip()
        if len(passage) > 220:
            snippet += "..."

        page = c.get("page_number") or c.get("metadata", {}).get("page")
        if page is None and passage:
            p_match = re.search(r'\b(?:Page|p\.)\s*(\d+)\b', passage, re.IGNORECASE)
            if p_match:
                try:
                    page = int(p_match.group(1))
                except ValueError:
                    page = None

        section = c.get("section_name") or c.get("metadata", {}).get("section")
        if (not section or section == "General Overview") and passage:
            sec_m = re.search(r'\b(REMEMBER\s*\|\s*[^•\n\r]{3,80})', passage)
            if not sec_m:
                sec_m = re.search(r'\b(?:Page\s*\d+\s+)?(\d+\.\d*\s+[A-Za-z][^\n•\r]{2,60})', passage)
            if not sec_m:
                sec_m = re.search(r'(?:Page\s*\d+\s+)([A-Z][A-Za-z0-9\s\-&]{3,50})', passage)
            if sec_m:
                section = sec_m.group(1).strip()
            else:
                section = section or "General Overview"

        cit = {
            "index": idx,
            "source_id": c.get("source_id", ""),
            "source_title": c.get("source_title", "Document"),
            "chunk_id": c.get("chunk_id") or c.get("id", f"chk-{idx}"),
            "chunk_index": int(c.get("chunk_index", idx - 1)),
            "snippet": snippet,
            "page_number": page,
            "section_name": section,
            "similarity_score": float(c.get("similarity_score", 1.0))
        }
        citations.append(cit)

        page_str = f", Page {page}" if page else ""
        sec_str = f", Section: {section}" if section else ""
        context_lines.append(f"[Citation {idx}] Source: \"{cit['source_title']}\"{page_str}{sec_str}\n{passage}")

    context_block = "\n\n".join(context_lines)
    return context_block, citations


class StudioEngine:
    """
    Generates structured studio artifacts grounded in notebook source material.
    """

    # -------------------------------------------------------------------------
    # 1. FLASHCARDS
    # -------------------------------------------------------------------------
    @classmethod
    def generate_flashcards(
        cls,
        chunks: List[Dict[str, Any]],
        focus_prompt: Optional[str] = None,
        ollama: Optional[OllamaClient] = None,
        model: Optional[str] = None,
        custom_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        context_block, citations = build_source_context_block(chunks)
        primary_title = chunks[0].get("source_title", "Study Material") if chunks else "Study Material"
        deck_title = custom_title or f"Flashcards: {primary_title}"

        system_prompt = (
            "You are an expert study aid generator. You create clear, accurate flashcards grounded strictly "
            "in the provided context passages. Do not invent facts or concepts not present in the sources.\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Flashcards: Topic",\n'
            '  "cards": [\n'
            '    {\n'
            '      "id": "card-1",\n'
            '      "question": "What is ...?",\n'
            '      "answer": "Direct, accurate answer grounded in the sources.",\n'
            '      "category": "Section or Category Name",\n'
            '      "citation_index": 1\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        user_prompt = f"Source Passages:\n{context_block}\n\n"
        if focus_prompt:
            user_prompt += f"Focus Topic / Instructions: {focus_prompt}\n"
        user_prompt += "Generate 4 to 8 high-quality study flashcards from the source material."

        if ollama:
            try:
                raw_response = ollama.generate(
                    prompt=user_prompt,
                    model=model,
                    system=system_prompt,
                    temperature=0.2,
                    top_p=0.9
                )
                cleaned = clean_json_string(raw_response)
                parsed = json.loads(cleaned)
                raw_cards = parsed.get("cards", [])
                if isinstance(raw_cards, list) and len(raw_cards) > 0:
                    validated_cards = []
                    seen_questions = set()
                    for idx, c in enumerate(raw_cards, 1):
                        q = str(c.get("question", "")).strip()
                        a = str(c.get("answer", "")).strip()
                        norm_q = re.sub(r'\W+', '', q.lower())
                        if q and a and norm_q not in seen_questions:
                            seen_questions.add(norm_q)
                            cit_idx = c.get("citation_index")
                            if not isinstance(cit_idx, int) or cit_idx < 1 or cit_idx > len(citations):
                                cit_idx = 1
                            matching_cit = citations[cit_idx - 1] if citations else {}
                            validated_cards.append({
                                "id": f"card-{idx}",
                                "question": q,
                                "answer": a,
                                "category": str(c.get("category") or matching_cit.get("section_name") or "General").strip(),
                                "citation_index": cit_idx,
                                "source_id": matching_cit.get("source_id"),
                                "source_title": matching_cit.get("source_title"),
                                "snippet": matching_cit.get("snippet")
                            })
                    if validated_cards:
                        return {
                            "title": parsed.get("title") or deck_title,
                            "structured_content": {
                                "cards": validated_cards,
                                "total_cards": len(validated_cards)
                            },
                            "citations": citations
                        }
            except Exception as e:
                logger.info(f"Ollama flashcard generation fallback triggered: {e}")

        # Deterministic grounded fallback
        fallback_cards = []
        seen_q = set()
        for idx, c in enumerate(citations, 1):
            passage = (chunks[idx - 1].get("passage") or chunks[idx - 1].get("text_content") or chunks[idx - 1].get("text") or "").strip()
            section = c.get("section_name") or "Key Concept"
            source_title = c.get("source_title") or "Source"

            # Look for definition-style sentences or headers
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', passage) if len(s.strip()) > 20]
            question = f"What key principle is outlined regarding '{section}' in {source_title}?"
            answer = sentences[0] if sentences else (passage[:160] + "...")
            if len(sentences) > 1 and any(k in sentences[1].lower() for k in ["is", "defined", "means", "requires", "operates"]):
                answer = sentences[1]

            norm = re.sub(r'\W+', '', question.lower())
            if norm not in seen_q:
                seen_q.add(norm)
                fallback_cards.append({
                    "id": f"card-{len(fallback_cards) + 1}",
                    "question": question,
                    "answer": answer,
                    "category": section,
                    "citation_index": c["index"],
                    "source_id": c["source_id"],
                    "source_title": c["source_title"],
                    "snippet": c["snippet"]
                })
            if len(fallback_cards) >= 6:
                break

        return {
            "title": deck_title,
            "structured_content": {
                "cards": fallback_cards,
                "total_cards": len(fallback_cards)
            },
            "citations": citations
        }

    # -------------------------------------------------------------------------
    # 2. MIND MAP
    # -------------------------------------------------------------------------
    @classmethod
    def generate_mindmap(
        cls,
        chunks: List[Dict[str, Any]],
        focus_prompt: Optional[str] = None,
        ollama: Optional[OllamaClient] = None,
        model: Optional[str] = None,
        custom_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        context_block, citations = build_source_context_block(chunks)
        primary_title = chunks[0].get("source_title", "Research Material") if chunks else "Research Material"
        map_title = custom_title or f"Mind Map: {primary_title}"

        system_prompt = (
            "You are a structured concept mapping expert. You analyze research text to extract a hierarchical "
            "concept graph with clear nodes and directed relationship edges. Ground all nodes directly in the source text.\n"
            "Return ONLY valid JSON with this exact schema:\n"
            "{\n"
            '  "title": "Mind Map: Topic",\n'
            '  "root_id": "node-root",\n'
            '  "nodes": [\n'
            '    {\n'
            '      "id": "node-root",\n'
            '      "label": "Central Topic",\n'
            '      "description": "Overview of the primary domain.",\n'
            '      "category": "Root",\n'
            '      "citation_index": 1\n'
            '    },\n'
            '    {\n'
            '      "id": "node-1",\n'
            '      "label": "Subconcept Name",\n'
            '      "description": "Specific finding or principle grounded in context.",\n'
            '      "category": "Architecture",\n'
            '      "citation_index": 1\n'
            '    }\n'
            '  ],\n'
            '  "edges": [\n'
            '    {\n'
            '      "from": "node-root",\n'
            '      "to": "node-1",\n'
            '      "label": "comprises"\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        user_prompt = f"Source Passages:\n{context_block}\n\n"
        if focus_prompt:
            user_prompt += f"Focus / Perspective: {focus_prompt}\n"
        user_prompt += "Generate a hierarchical mind map with 5 to 10 concept nodes and relationships connecting them to the root."

        if ollama:
            try:
                raw_response = ollama.generate(
                    prompt=user_prompt,
                    model=model,
                    system=system_prompt,
                    temperature=0.2,
                    top_p=0.9
                )
                cleaned = clean_json_string(raw_response)
                parsed = json.loads(cleaned)
                nodes = parsed.get("nodes", [])
                edges = parsed.get("edges", [])

                if isinstance(nodes, list) and len(nodes) >= 2:
                    node_ids = {n.get("id") for n in nodes if n.get("id")}
                    validated_edges = [
                        e for e in edges
                        if e.get("from") in node_ids and e.get("to") in node_ids
                    ]
                    # Attach citation evidence to nodes
                    for n in nodes:
                        c_idx = n.get("citation_index")
                        if isinstance(c_idx, int) and 1 <= c_idx <= len(citations):
                            matching_cit = citations[c_idx - 1]
                            n["source_id"] = matching_cit["source_id"]
                            n["source_title"] = matching_cit["source_title"]
                            n["snippet"] = matching_cit["snippet"]

                    return {
                        "title": parsed.get("title") or map_title,
                        "structured_content": {
                            "root_id": parsed.get("root_id") or nodes[0].get("id", "node-root"),
                            "nodes": nodes,
                            "edges": validated_edges
                        },
                        "citations": citations
                    }
            except Exception as e:
                logger.info(f"Ollama mind map generation fallback triggered: {e}")

        # Deterministic grounded fallback
        root_label = primary_title.replace(".pdf", "").replace(".txt", "").replace(".md", "")
        nodes = [{
            "id": "node-root",
            "label": root_label,
            "description": f"Central topic grounded in {len(citations)} source passages.",
            "category": "Root",
            "citation_index": 1,
            "source_id": citations[0]["source_id"] if citations else "",
            "source_title": citations[0]["source_title"] if citations else "",
            "snippet": citations[0]["snippet"] if citations else ""
        }]
        edges = []

        for idx, cit in enumerate(citations[:6], 1):
            n_id = f"node-{idx}"
            sec_name = cit.get("section_name") or f"Finding {idx}"
            label = sec_name[:32]
            nodes.append({
                "id": n_id,
                "label": label,
                "description": cit["snippet"],
                "category": "Key Finding",
                "citation_index": cit["index"],
                "source_id": cit["source_id"],
                "source_title": cit["source_title"],
                "snippet": cit["snippet"]
            })
            edges.append({
                "from": "node-root",
                "to": n_id,
                "label": "defines" if idx % 2 == 1 else "incorporates"
            })

        return {
            "title": map_title,
            "structured_content": {
                "root_id": "node-root",
                "nodes": nodes,
                "edges": edges
            },
            "citations": citations
        }

    # -------------------------------------------------------------------------
    # 3. REPORTS
    # -------------------------------------------------------------------------
    @classmethod
    def generate_report(
        cls,
        chunks: List[Dict[str, Any]],
        focus_prompt: Optional[str] = None,
        ollama: Optional[OllamaClient] = None,
        model: Optional[str] = None,
        custom_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        context_block, citations = build_source_context_block(chunks)
        primary_title = chunks[0].get("source_title", "Research Summary") if chunks else "Research Summary"
        report_title = custom_title or f"Research Report: {primary_title}"

        system_prompt = (
            "You are an executive research analyst. Write an authoritative, structured research report grounded "
            "strictly in the provided source passages. Do not invent any citations or facts.\n"
            "Include inline citation markers like [1], [2] referencing the context passages.\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Report Title",\n'
            '  "summary": "Executive summary paragraph with inline citations.",\n'
            '  "key_findings": ["Finding 1 [1]", "Finding 2 [2]"],\n'
            '  "sections": [\n'
            '    {\n'
            '      "heading": "Section Heading",\n'
            '      "content": "Detailed paragraphs with inline citations [1].",\n'
            '      "key_takeaways": ["Takeaway 1", "Takeaway 2"]\n'
            '    }\n'
            '  ],\n'
            '  "inferences_and_strategic_notes": "Distinct section outlining logical deductions, clearly separated from source facts."\n'
            "}"
        )

        user_prompt = f"Source Passages:\n{context_block}\n\n"
        if focus_prompt:
            user_prompt += f"Report Objective: {focus_prompt}\n"
        user_prompt += "Generate an executive research report with summary, key findings, 2 to 4 structured sections, and inference notes."

        if ollama:
            try:
                raw_response = ollama.generate(
                    prompt=user_prompt,
                    model=model,
                    system=system_prompt,
                    temperature=0.2,
                    top_p=0.9
                )
                cleaned = clean_json_string(raw_response)
                parsed = json.loads(cleaned)
                if parsed.get("summary") and parsed.get("sections"):
                    # Assemble full markdown version
                    md_parts = [
                        f"# {parsed.get('title') or report_title}\n",
                        f"## Executive Summary\n{parsed.get('summary')}\n",
                        "## Key Findings\n" + "\n".join(f"- {kf}" for kf in parsed.get("key_findings", [])) + "\n"
                    ]
                    for sec in parsed.get("sections", []):
                        md_parts.append(f"### {sec.get('heading', 'Section')}\n{sec.get('content', '')}\n")
                        if sec.get("key_takeaways"):
                            md_parts.append("**Key Takeaways:**\n" + "\n".join(f"- {t}" for t in sec["key_takeaways"]) + "\n")
                    if parsed.get("inferences_and_strategic_notes"):
                        md_parts.append(f"## Strategic Inferences & Analysis\n> {parsed.get('inferences_and_strategic_notes')}\n")

                    parsed["markdown"] = "\n".join(md_parts)
                    return {
                        "title": parsed.get("title") or report_title,
                        "structured_content": parsed,
                        "citations": citations
                    }
            except Exception as e:
                logger.info(f"Ollama report generation fallback triggered: {e}")

        # Deterministic grounded fallback
        findings = [f"{c['snippet']} [{c['index']}]" for c in citations[:4]]
        sections = []
        for c in citations[:3]:
            sec_name = c.get("section_name") or f"Analysis Part {c['index']}"
            sections.append({
                "heading": sec_name,
                "content": f"According to *{c['source_title']}*, {c['snippet']} [{c['index']}]. This section establishes operational parameters verified directly from the source.",
                "key_takeaways": [
                    f"Directly verified in {c['source_title']} (Section: {c.get('section_name')}) [{c['index']}]"
                ]
            })

        summary = (
            f"This report synthesizes source materials from {primary_title}. "
            f"The primary findings confirm verified evidence across {len(citations)} key passages [1]. "
            "All assertions are directly linked to active document citations."
        )

        md_content = f"# {report_title}\n\n"
        md_content += f"## Executive Summary\n{summary}\n\n"
        md_content += "## Key Findings\n" + "\n".join(f"- {f}" for f in findings) + "\n\n"
        for s in sections:
            md_content += f"### {s['heading']}\n{s['content']}\n\n"
        md_content += "## Strategic Inferences & Analysis\n> All conclusions herein are verifiable against the cited document records.\n"

        structured = {
            "title": report_title,
            "summary": summary,
            "key_findings": findings,
            "sections": sections,
            "inferences_and_strategic_notes": "Observations reflect document evidence strictly.",
            "markdown": md_content
        }

        return {
            "title": report_title,
            "structured_content": structured,
            "citations": citations
        }

    # -------------------------------------------------------------------------
    # 4. INFOGRAPHIC
    # -------------------------------------------------------------------------
    @classmethod
    def generate_infographic(
        cls,
        chunks: List[Dict[str, Any]],
        focus_prompt: Optional[str] = None,
        ollama: Optional[OllamaClient] = None,
        model: Optional[str] = None,
        custom_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        context_block, citations = build_source_context_block(chunks)
        primary_title = chunks[0].get("source_title", "Document Analysis") if chunks else "Document Analysis"
        info_title = custom_title or f"Infographic: {primary_title}"

        system_prompt = (
            "You are a visual data journalist. Generate a structured visual infographic specification grounded "
            "strictly in the source passages. CRITICAL: Never invent numerical statistics, numbers, or facts.\n"
            "If exact numbers appear in the text, you may use them; otherwise use categorical descriptors, counts of sections, "
            "or foundational qualitative metrics (e.g. '3 Layers', '100% Local').\n"
            "Return ONLY valid JSON with this schema:\n"
            "{\n"
            '  "title": "Infographic Title",\n'
            '  "subtitle": "Clear, grounded subtitle",\n'
            '  "theme": "slate",\n'  # slate, blue, emerald, purple, amber
            '  "stats": [\n'
            '    {\n'
            '      "label": "Metric or Core Focus",\n'
            '      "value": "Value or Stat",\n'
            '      "context": "Context sentence",\n'
            '      "source_ref": "[1]"\n'
            '    }\n'
            '  ],\n'
            '  "key_takeaways": [\n'
            '    "Evidence-backed fact or takeaway 1 [1]",\n'
            '    "Evidence-backed fact or takeaway 2 [2]"\n'
            '  ],\n'
            '  "process_steps": [\n'
            '    {\n'
            '      "step": 1,\n'
            '      "title": "Stage Name",\n'
            '      "description": "Details from text [1]"\n'
            '    }\n'
            '  ],\n'
            '  "comparison_points": [\n'
            '    {\n'
            '      "feature": "Comparison Dimension",\n'
            '      "side_a": "First aspect or condition",\n'
            '      "side_b": "Second aspect or outcome"\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        user_prompt = f"Source Passages:\n{context_block}\n\n"
        if focus_prompt:
            user_prompt += f"Visual Focus: {focus_prompt}\n"
        user_prompt += "Generate a rich, grounded infographic specification with 3-4 stats/metrics, 3-4 takeaways, 3-4 process steps, and 2 comparisons."

        if ollama:
            try:
                raw_response = ollama.generate(
                    prompt=user_prompt,
                    model=model,
                    system=system_prompt,
                    temperature=0.2,
                    top_p=0.9
                )
                cleaned = clean_json_string(raw_response)
                parsed = json.loads(cleaned)
                if parsed.get("stats") and parsed.get("key_takeaways"):
                    return {
                        "title": parsed.get("title") or info_title,
                        "structured_content": parsed,
                        "citations": citations
                    }
            except Exception as e:
                logger.info(f"Ollama infographic generation fallback triggered: {e}")

        # Deterministic grounded fallback
        stats = []
        for idx, cit in enumerate(citations[:3], 1):
            stats.append({
                "label": cit.get("section_name") or f"Point {idx}",
                "value": f"Sec {idx}",
                "context": cit["snippet"][:90] + "...",
                "source_ref": f"[{cit['index']}]"
            })

        takeaways = [
            f"Grounded evidence verified in {c['source_title']} [{c['index']}]: {c['snippet'][:110]}..."
            for c in citations[:4]
        ]

        steps = []
        for idx, cit in enumerate(citations[:3], 1):
            steps.append({
                "step": idx,
                "title": cit.get("section_name") or f"Phase {idx}",
                "description": f"{cit['snippet'][:130]}... [{cit['index']}]"
            })

        comparisons = [
            {
                "feature": "Source Context",
                "side_a": f"Source: {citations[0]['source_title']}" if citations else "Primary",
                "side_b": f"Passage count: {len(citations)} verified chunks"
            }
        ]

        structured = {
            "title": info_title,
            "subtitle": f"Visual synthesis based on {len(citations)} retrieved source evidence chunks",
            "theme": "blue",
            "stats": stats,
            "key_takeaways": takeaways,
            "process_steps": steps,
            "comparison_points": comparisons
        }

        return {
            "title": info_title,
            "structured_content": structured,
            "citations": citations
        }

    # -------------------------------------------------------------------------
    # 5. AUDIO OVERVIEW
    # -------------------------------------------------------------------------
    # 5. AUDIO OVERVIEW (PODCAST)
    # -------------------------------------------------------------------------
    @classmethod
    def generate_audio_overview(
        cls,
        chunks: List[Dict[str, Any]],
        focus_prompt: Optional[str] = None,
        ollama: Optional[OllamaClient] = None,
        model: Optional[str] = None,
        custom_title: Optional[str] = None,
        is_regeneration: bool = False,
        previous_dialogue: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        context_block, citations = build_source_context_block(chunks)
        primary_title = (chunks[0].get("source_title") if chunks else None) or "Research Topic"
        clean_name = str(primary_title).replace(".pdf", "").replace(".txt", "").replace(".md", "")
        overview_title = custom_title or f"Discussion: {clean_name}"

        system_prompt = (
            "You are a podcast producer creating a natural, engaging conversation between two hosts based strictly "
            "on the provided research documents:\n"
            "- Host A (Alex): Curious, friendly, poses thoughtful questions, sets the stage, introduces key themes.\n"
            "- Host B (Sam): Analytical expert, explains mechanisms, cites direct evidence from the sources.\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Discussion: Topic",\n'
            '  "dialogue": [\n'
            '    {\n'
            '      "speaker": "Host A (Alex)",\n'
            '      "text": "Welcome to Orion Studio! Today we are looking into..."\n'
            '    },\n'
            '    {\n'
            '      "speaker": "Host B (Sam)",\n'
            '      "text": "That is right Alex. What stands out right away from the documents is..."\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        if is_regeneration:
            system_prompt += (
                "\n\nIMPORTANT REGENERATION DIRECTIVE:\n"
                "This is an explicit regeneration request for a fresh, new episode. Produce a distinctly new conversation with:\n"
                "- A completely different conversational opening hook from Alex;\n"
                "- A fresh conversational narrative progression and line of inquiry;\n"
                "- Varied questions and deeper analytical explanations from Host B;\n"
                "- Distinct phrasing and transitions, while remaining strictly grounded in the same source passages."
            )

        user_prompt = f"Source Passages:\n{context_block}\n\n"
        if focus_prompt:
            user_prompt += f"Listener Focus / Question: {focus_prompt}\n"

        if is_regeneration:
            user_prompt += "Generate a fresh, realistic 6 to 10 turn dialogue between Alex and Sam exploring different aspects of the source material."
            if previous_dialogue and len(previous_dialogue) > 0:
                prev_hook = str(previous_dialogue[0].get("text", ""))[:140]
                user_prompt += f"\nNote: The previous discussion opened with: '{prev_hook}'. Do NOT duplicate this opening. Introduce a new starting hook."
        else:
            user_prompt += "Generate a realistic 6 to 10 turn dialogue between Alex and Sam diving into the source material."

        if ollama:
            sampling_temp = 0.7 if is_regeneration else 0.4
            raw_response: Optional[str] = None
            try:
                raw_response = ollama.generate(
                    prompt=user_prompt,
                    model=model,
                    system=system_prompt,
                    temperature=sampling_temp,
                    top_p=0.9,
                    format="json"
                )
            except (OllamaConnectionError, OllamaTimeoutError, OllamaModelNotFoundError):
                # Critical: Re-raise during regeneration so endpoints return 503/504/404
                # and never silently destroy or replace existing working dialogue.
                if is_regeneration:
                    raise
                logger.info("Ollama unavailable during initial audio overview generation; falling back to grounded baseline dialogue.")
            except Exception as e:
                if is_regeneration:
                    logger.error(f"Ollama generation unexpected error during audio overview: {e}", exc_info=True)
                    raise
                logger.info(f"Ollama audio overview generation fallback triggered: {e}")

            if raw_response:
                cleaned = clean_json_string(raw_response)
                try:
                    parsed = json.loads(cleaned)
                except Exception as jde:
                    if is_regeneration:
                        logger.warning(f"Failed to parse regenerated model JSON: {jde}. Raw was: {raw_response[:200]}")
                        raise StudioValidationError(f"Model response was not valid JSON: {str(jde)}") from jde
                    else:
                        logger.info(f"Ollama non-JSON output, using grounded baseline: {jde}")
                        parsed = None

                if parsed and isinstance(parsed, dict):
                    raw_lines = parsed.get("dialogue")
                    if isinstance(raw_lines, list) and len(raw_lines) >= 2:
                        timed_lines = []
                        curr_time = 0.0
                        for idx, line in enumerate(raw_lines, 1):
                            if not isinstance(line, dict):
                                continue
                            spk = str(line.get("speaker", ""))
                            if "Alex" in spk or "Host A" in spk or spk.strip() == "A":
                                speaker = "Host A (Alex)"
                            elif "Sam" in spk or "Host B" in spk or spk.strip() == "B":
                                speaker = "Host B (Sam)"
                            else:
                                speaker = spk.strip() or ("Host A (Alex)" if idx % 2 == 1 else "Host B (Sam)")

                            txt = str(line.get("text", "")).strip()
                            if not txt:
                                continue

                            word_count = max(1, len(txt.split()))
                            duration = round(0.8 + (word_count / 2.5), 1)
                            timed_lines.append({
                                "id": f"pod-{idx}",
                                "speaker": speaker,
                                "text": txt,
                                "startTime": curr_time,
                                "duration": duration
                            })
                            curr_time = round(curr_time + duration + 0.3, 1)

                        if len(timed_lines) >= 2:
                            output_title = str(parsed.get("title") or overview_title).strip() or overview_title
                            return {
                                "title": output_title,
                                "structured_content": {
                                    "title": output_title,
                                    "dialogue": timed_lines,
                                    "total_duration": curr_time,
                                    "hosts": {
                                        "host_a": {"name": "Alex", "role": "Curious Host"},
                                        "host_b": {"name": "Sam", "role": "Analytical Expert"}
                                    }
                                },
                                "citations": citations
                            }
                        elif is_regeneration:
                            raise StudioValidationError("Model generated dialogue lines with empty text.")
                    elif is_regeneration:
                        raise StudioValidationError("Generated dialogue must contain at least two speaker turns.")
                elif is_regeneration and parsed is not None:
                    raise StudioValidationError("Model JSON response must be an object with 'dialogue' list.")


        # Deterministic grounded fallback templates (used when running without LLM)
        fact_1 = str(citations[0].get("snippet") or "the foundational principles of the research") if citations else "the core principles of the research"
        fact_2 = str(citations[1].get("snippet") or fact_1) if len(citations) > 1 else fact_1
        fact_3 = str(citations[2].get("snippet") or fact_2) if len(citations) > 2 else fact_2

        if is_regeneration:
            # Fresh dialogue template with distinct structural flow and conversational transitions
            dialogue = [
                {
                    "id": "pod-1",
                    "speaker": "Host A (Alex)",
                    "text": f"Welcome back to Orion Studio! Alex here with Sam, taking a fresh deep-dive into '{clean_name}' from an implementation perspective.",
                    "startTime": 0.0,
                    "duration": 5.2
                },
                {
                    "id": "pod-2",
                    "speaker": "Host B (Sam)",
                    "text": f"Great to be back. What really jumps out when examining the practical flow is: '{fact_2[:130]}'.",
                    "startTime": 5.5,
                    "duration": 5.6
                },
                {
                    "id": "pod-3",
                    "speaker": "Host A (Alex)",
                    "text": "That shifts how we think about it in practice. What underlying constraint or rule is driving that mechanism?",
                    "startTime": 11.4,
                    "duration": 4.6
                },
                {
                    "id": "pod-4",
                    "speaker": "Host B (Sam)",
                    "text": f"The source material directly states: '{fact_1[:140]}'. That is why the operational trade-offs work the way they do.",
                    "startTime": 16.3,
                    "duration": 5.8
                },
                {
                    "id": "pod-5",
                    "speaker": "Host A (Alex)",
                    "text": "So looking at the full system in action, how do the sources synthesize the final outcome?",
                    "startTime": 22.4,
                    "duration": 4.3
                },
                {
                    "id": "pod-6",
                    "speaker": "Host B (Sam)",
                    "text": f"The documented takeaway is unequivocal: '{fact_3[:130]}'. That gives us a complete, grounded picture.",
                    "startTime": 27.0,
                    "duration": 5.5
                }
            ]
        else:
            # Initial baseline dialogue template
            dialogue = [
                {
                    "id": "pod-1",
                    "speaker": "Host A (Alex)",
                    "text": f"Welcome back to Orion Studio. Today we are exploring '{clean_name}', diving straight into the evidence.",
                    "startTime": 0.0,
                    "duration": 4.8
                },
                {
                    "id": "pod-2",
                    "speaker": "Host B (Sam)",
                    "text": f"Thanks, Alex! Looking right at the text, the central theme opens with this: '{fact_1[:130]}'.",
                    "startTime": 5.1,
                    "duration": 5.8
                },
                {
                    "id": "pod-3",
                    "speaker": "Host A (Alex)",
                    "text": "That establishes the foundation. How does the author follow up on that in subsequent sections?",
                    "startTime": 11.2,
                    "duration": 4.5
                },
                {
                    "id": "pod-4",
                    "speaker": "Host B (Sam)",
                    "text": f"Well, the document emphasizes: '{fact_2[:140]}'. It shows how these components interact.",
                    "startTime": 16.0,
                    "duration": 5.9
                },
                {
                    "id": "pod-5",
                    "speaker": "Host A (Alex)",
                    "text": "And wrapping it together, what is the biggest takeaway for someone studying this material?",
                    "startTime": 22.2,
                    "duration": 4.2
                },
                {
                    "id": "pod-6",
                    "speaker": "Host B (Sam)",
                    "text": f"The key conclusion is clear: '{fact_3[:130]}'. Everything ties directly back to verified document findings.",
                    "startTime": 26.7,
                    "duration": 5.5
                }
            ]

        total_dur = dialogue[-1]["startTime"] + dialogue[-1]["duration"]
        return {
            "title": overview_title,
            "structured_content": {
                "title": overview_title,
                "dialogue": dialogue,
                "total_duration": total_dur,
                "hosts": {
                    "host_a": {"name": "Alex", "role": "Curious Host"},
                    "host_b": {"name": "Sam", "role": "Analytical Expert"}
                }
            },
            "citations": citations
        }

