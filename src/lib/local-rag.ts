import { SourceDoc, SourceChunk, Citation, ChatMessage, StudioArtifact, PodcastDialogueLine } from './types';

// Text chunker
export function chunkDocument(sourceId: string, text: string, chunkSize: number = 450, chunkOverlap: number = 80): SourceChunk[] {
  const cleanText = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  const paragraphs = cleanText.split(/\n+/).filter(p => p.trim().length > 0);
  const chunks: SourceChunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;
  let pageEstimate = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const pageMatch = trimmed.match(/--- Page (\d+) ---/);
    if (pageMatch) {
      pageEstimate = parseInt(pageMatch[1], 10);
      continue;
    }

    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `${sourceId}-c-${chunkIndex}`,
        sourceId,
        text: currentChunk.trim(),
        index: chunkIndex,
        metadata: {
          page: pageEstimate,
          section: currentChunk.slice(0, 45) + '...'
        }
      });
      chunkIndex++;
      currentChunk = currentChunk.slice(Math.max(0, currentChunk.length - chunkOverlap)) + ' ' + trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${sourceId}-c-${chunkIndex}`,
      sourceId,
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: {
        page: pageEstimate,
        section: currentChunk.slice(0, 45) + '...'
      }
    });
  }

  return chunks;
}

// BM25 / Term-Frequency Semantic Search across selected source chunks
export function retrieveRelevantChunks(query: string, sources: SourceDoc[], topK: number = 4): Citation[] {
  const selectedSources = sources.filter(s => s.isSelected);
  if (selectedSources.length === 0) return [];

  const queryTerms = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !['the', 'and', 'what', 'how', 'who', 'are', 'is', 'in', 'of', 'for', 'to'].includes(t));

  const scoredChunks: { chunk: SourceChunk; source: SourceDoc; score: number }[] = [];

  for (const source of selectedSources) {
    for (const chunk of source.chunks) {
      const chunkTextLower = chunk.text.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (chunkTextLower.includes(term)) {
          const matches = (chunkTextLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
          score += matches * 3.0;
        }
      }

      if (source.title.toLowerCase().includes(query.toLowerCase())) {
        score += 2.0;
      }

      if (score > 0) {
        scoredChunks.push({ chunk, source, score });
      }
    }
  }

  scoredChunks.sort((a, b) => b.score - a.score);

  const selected = scoredChunks.length > 0 
    ? scoredChunks.slice(0, topK) 
    : selectedSources.flatMap(s => s.chunks.slice(0, 2).map(chunk => ({ chunk, source: s, score: 0.5 }))).slice(0, topK);

  return selected.map((item, idx) => ({
    index: idx + 1,
    sourceId: item.source.id,
    sourceTitle: item.source.title,
    snippet: cleanSnippet(item.chunk.text),
    page: item.chunk.metadata?.page || 1,
    section: item.chunk.metadata?.section,
    score: item.score
  }));
}

function cleanSnippet(text: string): string {
  return text
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/<<.*?>>/g, '')
    .replace(/obj.*?endobj/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check local Ollama connection
export async function checkOllamaConnection(url: string = 'http://localhost:11434'): Promise<{ isAvailable: boolean; models: string[] }> {
  try {
    const res = await fetch(`${url}/api/tags`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { isAvailable: false, models: [] };
    const data = await res.json();
    const models = (data.models || []).map((m: any) => m.name || m.model);
    return { isAvailable: true, models };
  } catch (err) {
    return { isAvailable: false, models: [] };
  }
}

// Generate grounded answer
export async function generateRAGAnswer(
  query: string,
  sources: SourceDoc[],
  chatHistory: ChatMessage[],
  ollamaUrl: string = 'http://localhost:11434',
  modelName: string = 'llama3.2:latest',
  onToken?: (token: string) => void
): Promise<{ text: string; citations: Citation[]; suggestedFollowUps: string[] }> {
  const citations = retrieveRelevantChunks(query, sources, 4);
  const selectedSources = sources.filter(s => s.isSelected);

  if (selectedSources.length === 0) {
    return {
      text: "Please add a source document on the left first.",
      citations: [],
      suggestedFollowUps: []
    };
  }

  // Grounded context prompt for Ollama
  const contextSnippet = citations
    .map(c => `[Citation [${c.index}] from "${c.sourceTitle}" (Page ${c.page || 1})]:\n${c.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are a direct, intelligent research assistant. Answer the user's question directly, clearly, and concisely using only the provided context. Include inline citation tags like [1] next to specific facts. Do not include boilerplate introductory phrases or disclaimers.`;

  const userPrompt = `Context:\n${contextSnippet}\n\nQuestion: ${query}`;

  // Try calling local Ollama first
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: true,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        }
      })
    });

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              fullText += parsed.response;
              onToken?.(parsed.response);
            }
          } catch (e) {
            // ignore
          }
        }
      }

      if (fullText.trim().length > 0) {
        return {
          text: fullText.trim(),
          citations,
          suggestedFollowUps: []
        };
      }
    }
  } catch (err) {
    // Fallback to on-device direct answer extraction
  }

  // Direct, concise, waste-free answer extraction
  const directAnswer = synthesizeDirectAnswer(query, citations, selectedSources);
  
  if (onToken) {
    const words = directAnswer.split(' ');
    for (const w of words) {
      onToken(w + ' ');
      await new Promise(r => setTimeout(r, 12));
    }
  }

  return {
    text: directAnswer,
    citations,
    suggestedFollowUps: []
  };
}

// Pure direct answering without filler or disclaimers
function synthesizeDirectAnswer(query: string, citations: Citation[], sources: SourceDoc[]): string {
  if (citations.length === 0) {
    return `No relevant information found in the active documents for "${query}".`;
  }

  const cleanCitations = citations.filter(c => c.snippet && c.snippet.length > 5);
  if (cleanCitations.length === 0) {
    return `The document does not contain readable text.`;
  }

  const queryWords = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['what', 'who', 'how', 'many', 'tell', 'about', 'the', 'is', 'are', 'and'].includes(w));

  // Find sentences matching the user's question directly
  const matchingLines: { line: string; citationIndex: number }[] = [];

  for (let cIdx = 0; cIdx < cleanCitations.length; cIdx++) {
    const citation = cleanCitations[cIdx];
    // Split into sentences / structural lines
    const lines = citation.snippet.split(/[.\n;]+/).map(l => l.trim()).filter(l => l.length > 10);
    
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      let matchCount = 0;
      for (const w of queryWords) {
        if (lineLower.includes(w)) matchCount++;
      }
      if (matchCount > 0) {
        if (!matchingLines.some(m => m.line.toLowerCase() === lineLower)) {
          matchingLines.push({ line, citationIndex: citation.index });
        }
      }
    }
  }

  if (matchingLines.length > 0) {
    if (matchingLines.length === 1) {
      return `${matchingLines[0].line} [${matchingLines[0].citationIndex}]`;
    }
    return matchingLines.slice(0, 4).map(m => `• ${m.line} [${m.citationIndex}]`).join('\n\n');
  }

  // If general summary question or broad query, return top relevant passage directly
  return `${cleanCitations[0].snippet.slice(0, 300)} [${cleanCitations[0].index}]`;
}

// Generate Audio Discussion Script (Alex & Sam)
export function generatePodcastScript(topic: string, sources: SourceDoc[]): PodcastDialogueLine[] {
  const selected = sources.filter(s => s.isSelected);
  const sourceName = selected[0]?.title || 'Uploaded Documents';
  const snippet = selected[0]?.content.slice(0, 200).replace(/\s+/g, ' ') || 'the key findings';

  return [
    {
      id: 'pod-1',
      speaker: 'Host A (Alex)',
      text: `Looking at ${sourceName}, the main points focus on: ${snippet.slice(0, 120)}...`,
      startTime: 0,
      duration: 6.5
    },
    {
      id: 'pod-2',
      speaker: 'Host B (Sam)',
      text: `Right, and all the details and roles are directly documented in the text.`,
      startTime: 6.5,
      duration: 5.5
    }
  ];
}
