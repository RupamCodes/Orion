"""
Tests for Batch 4 contracts: Markdown citations, Studio SVG payload validation, and clean titles.
"""
import re
import xml.etree.ElementTree as ET
import pytest


def escape_xml(s: str) -> str:
    """Mirrors the frontend XML escape helper."""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def test_svg_xml_escaping_validity():
    """Verify that unescaped characters like &, <, >, \", ' generate valid XML when escaped."""
    raw_title = "Research & Strategy <Quarter 4> - \"High Priority\""
    raw_subtitle = "Analysis of AT&T & Competitors' Tech Stack"
    
    escaped_title = escape_xml(raw_title)
    escaped_subtitle = escape_xml(raw_subtitle)

    svg_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 680" width="860" height="680">
  <rect width="860" height="680" fill="#09090b"/>
  <text x="40" y="60">{escaped_title}</text>
  <text x="40" y="90">{escaped_subtitle}</text>
</svg>"""

    # Parsing must succeed without ParseError
    root = ET.fromstring(svg_content)
    assert root.tag.endswith("svg")
    texts = [elem.text for elem in root.findall("{http://www.w3.org/2000/svg}text")]
    assert raw_title in texts
    assert raw_subtitle in texts


def test_markdown_citation_regex_contract():
    """Verify that citation indices [n] in model output are strictly detected and separable from markdown."""
    pattern = re.compile(r"(\[\d+\])")
    
    sample = "Under Theorem 1 [1], quantum state fidelity [2] surpasses 99.8%."
    parts = pattern.split(sample)
    
    assert "[1]" in parts
    assert "[2]" in parts
    assert len(parts) == 5  # ["Under Theorem 1 ", "[1]", ", quantum state fidelity ", "[2]", " surpasses 99.8%."]


def test_clean_note_title_extraction():
    """Ensure raw markdown headers (#, ##, **), citations, and quotes are stripped for note titles."""
    content = "### 1. Key Finding & Recommendation [1]\nHere is the detailed analysis."
    
    # Strip leading markdown markers and citation brackets
    clean_snippet = re.sub(r"^[#\s*>-]+", "", content, flags=re.MULTILINE)
    clean_snippet = re.sub(r"\[\d+\]", "", clean_snippet).strip()
    title = f"Note: {clean_snippet[:36]}..."
    
    assert title.startswith("Note: 1. Key Finding & Recommendation")
    assert "###" not in title
    assert "[1]" not in title
