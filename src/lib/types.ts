export type SourceType = 'pdf' | 'txt' | 'md' | 'url' | 'audio' | 'note' | 'youtube' | 'link' | 'image_ocr';

export interface SourceCreateInput {
  title: string;
  content: string;
  source_type: SourceType;
  summary?: string;
  is_selected?: boolean;
  metadata?: Record<string, any>;
}

export interface SourceUpdateInput {
  title?: string;
  is_selected?: boolean;
  summary?: string;
  metadata?: Record<string, any>;
}

export interface Notebook {
  id: string;
  title: string;
  description?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface NotebookCreateInput {
  title: string;
  description?: string | null;
}

export interface NotebookUpdateInput {
  title?: string;
  description?: string | null;
}

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
  notebookId?: string;
}

export interface Citation {
  index: number;
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  page?: number;
  section?: string;
  score?: number;
  chunkId?: string;
  chunkIndex?: number;
  sourceAvailable?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  model?: string;
  suggestedFollowUps?: string[];
  conversationId?: string;
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
  citation_index?: number;
  source_id?: string;
  source_title?: string;
  snippet?: string;
}

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  connections: string[];
}

export interface MindMapNode {
  id: string;
  label: string;
  description: string;
  category?: string;
  citation_index?: number;
  source_id?: string;
  source_title?: string;
  snippet?: string;
}

export interface MindMapEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ReportSection {
  heading: string;
  content: string;
  key_takeaways?: string[];
}

export interface ReportData {
  title?: string;
  summary: string;
  key_findings: string[];
  sections: ReportSection[];
  inferences_and_strategic_notes?: string;
  markdown?: string;
}

export interface InfographicStat {
  label: string;
  value: string;
  context?: string;
  source_ref?: string;
}

export interface InfographicStep {
  step: number;
  title: string;
  description: string;
}

export interface InfographicComparison {
  feature: string;
  side_a: string;
  side_b: string;
}

export interface InfographicData {
  title?: string;
  subtitle?: string;
  theme?: string;
  stats: InfographicStat[];
  key_takeaways: string[];
  process_steps: InfographicStep[];
  comparison_points?: InfographicComparison[];
}

export interface StudioArtifact {
  id: string;
  notebook_id: string;
  artifact_type: 'audio_overview' | 'flashcards' | 'mindmap' | 'report' | 'infographic' | string;
  title: string;
  structured_content: any;
  source_ids?: string[];
  citations?: Citation[];
  status?: string;
  created_at: string;
  updated_at: string;
  // Backward compatibility convenience accessors
  type?: string;
  content?: string;
  dialogue?: PodcastDialogueLine[];
  flashcards?: Flashcard[];
}

export interface ArtifactCreateInput {
  artifact_type: string;
  title: string;
  structured_content: Record<string, any>;
  source_ids?: string[];
  citations?: Citation[];
  status?: string;
}

export interface ArtifactUpdateInput {
  title?: string;
  structured_content?: Record<string, any>;
  status?: string;
}

export interface ArtifactGenerateInput {
  artifact_type: string;
  title?: string;
  selected_source_ids?: string[] | null;
  focus_prompt?: string | null;
  model?: string | null;
  is_regeneration?: boolean;
  regenerate_artifact_id?: string | null;
}

export interface ArtifactRegenerateInput {
  focus_prompt?: string | null;
  model?: string | null;
  title?: string | null;
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

export interface SearchRequestInput {
  query: string;
  top_k?: number;
  threshold?: number;
  selected_source_ids?: string[];
}

export interface SearchResultItem {
  chunk_id: string;
  source_id: string;
  source_title: string;
  chunk_index: number;
  passage: string;
  text_content: string;
  page_number?: number | null;
  section_name?: string | null;
  similarity_score: number;
  notebook_id: string;
}

export interface SearchResponse {
  query: string;
  notebook_id: string;
  total_results: number;
  results: SearchResultItem[];
}

export interface ReindexResponse {
  status: string;
  notebook_id?: string | null;
  indexed_chunks: number;
  message: string;
}

export interface BackendCitationItem {
  index: number;
  source_id: string;
  source_title: string;
  chunk_id: string;
  chunk_index: number;
  snippet: string;
  page_number?: number | null;
  section_name?: string | null;
  similarity_score: number;
}

export interface ChatRequestInput {
  message: string;
  conversation_id?: string | null;
  selected_source_ids?: string[] | null;
  model?: string | null;
  top_k?: number;
  threshold?: number;
}

export interface ChatResponseOutput {
  answer: string;
  citations: Citation[];
  conversation_id?: string | null;
  model: string;
  notebook_id: string;
}

// ============================================================================
// Conversation & Message Types
// ============================================================================

export interface Conversation {
  id: string;
  notebook_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ConversationDetail extends Conversation {
  messages: ChatMessage[];
}

export interface ConversationCreateInput {
  title?: string;
}

export interface ConversationUpdateInput {
  title: string;
}

export interface ConversationMessageInput {
  message: string;
  message_id?: string;
  selected_source_ids?: string[] | null;
  model?: string | null;
  top_k?: number;
  threshold?: number;
}

export interface ConversationChatResponseOutput {
  answer: string;
  citations: Citation[];
  conversation_id: string;
  notebook_id: string;
  model: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}



