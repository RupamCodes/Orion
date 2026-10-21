export type SourceType = 'pdf' | 'txt' | 'md' | 'url' | 'audio' | 'note' | 'youtube' | 'link';

export interface SourceChunk {
  id: string;
  sourceId: string;
  text: string;
  index: number;
  metadata?: {
    page?: number;
    section?: string;
  };
}

export interface SourceDoc {
  id: string;
  title: string;
  type: SourceType;
  content: string;
  summary?: string;
  wordCount: number;
  chunks: SourceChunk[];
  isSelected: boolean;
  createdAt: string;
  topics?: string[];
}

export interface Citation {
  index: number;
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  page?: number;
  section?: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  model?: string;
  suggestedFollowUps?: string[];
}

export interface PodcastDialogueLine {
  id: string;
  speaker: 'Host A (Alex)' | 'Host B (Sam)';
  text: string;
  startTime: number; // in seconds
  duration: number; // in seconds
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  connections: string[];
}

export interface StudioArtifact {
  id: string;
  type: 'podcast' | 'study_guide' | 'briefing' | 'faq' | 'flashcards' | 'mindmap';
  title: string;
  content: string;
  dialogue?: PodcastDialogueLine[];
  audioUrl?: string;
  flashcards?: Flashcard[];
  conceptNodes?: ConceptNode[];
  createdAt: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  color?: string;
  createdAt: string;
  pinnedCitation?: Citation;
}

export interface LocalModelSettings {
  provider: 'ollama' | 'native_rag' | 'backend_fastapi';
  ollamaUrl: string;
  selectedModel: string;
  temperature: number;
  topP: number;
  chunkSize: number;
  chunkOverlap: number;
}
