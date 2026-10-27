import { 
  Notebook, 
  NotebookCreateInput, 
  NotebookUpdateInput, 
  SourceDoc, 
  SourceCreateInput, 
  SourceUpdateInput,
  SourceType,
  SearchRequestInput,
  SearchResponse,
  ReindexResponse,
  ChatRequestInput,
  ChatResponseOutput,
  BackendCitationItem,
  Citation,
  Conversation,
  ConversationDetail,
  ConversationCreateInput,
  ConversationUpdateInput,
  ConversationMessageInput,
  ConversationChatResponseOutput,
  ChatMessage,
  StudioArtifact,
  ArtifactCreateInput,
  ArtifactUpdateInput,
  ArtifactGenerateInput,
  ArtifactRegenerateInput
} from './types';


export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public detail?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = '/api/py';

interface BackendSourceResponse {
  id: string;
  notebook_id: string;
  title: string;
  source_type: string;
  raw_content: string;
  summary?: string | null;
  word_count: number;
  is_selected: boolean;
  meta_info?: Record<string, any> | null;
  chunks: Array<{
    id: string;
    source_id: string;
    chunk_index: number;
    text_content: string;
    page_number?: number | null;
    section_name?: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

function mapSourceResponseToSourceDoc(res: BackendSourceResponse): SourceDoc {
  return {
    id: res.id,
    notebookId: res.notebook_id,
    title: res.title,
    type: (res.source_type as SourceType) || 'txt',
    content: res.raw_content,
    summary: res.summary || undefined,
    wordCount: res.word_count,
    isSelected: res.is_selected,
    createdAt: res.created_at ? res.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
    topics: (res.meta_info?.topics as string[]) || [res.source_type.toUpperCase()],
    chunks: (res.chunks || []).map(c => ({
      id: c.id,
      sourceId: c.source_id,
      text: c.text_content,
      index: c.chunk_index,
      metadata: {
        page: c.page_number || undefined,
        section: c.section_name || undefined,
      }
    }))
  };
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      cache: 'no-store',
    });
  } catch {
    // Network failure / server offline
    throw new ApiError(
      'Unable to connect to Orion backend. Ensure the Python server is running at http://localhost:8000.'
    );
  }

  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    let detail: any = null;
    try {
      const errJson = await res.json();
      detail = errJson;
      if (typeof errJson.detail === 'string') {
        errorMessage = errJson.detail;
      } else if (Array.isArray(errJson.detail)) {
        errorMessage = errJson.detail
          .map((d: any) => d.msg || JSON.stringify(d))
          .join(', ');
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(errorMessage, res.status, detail);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('Invalid JSON response received from server.');
  }
}

// ============================================================================
// Notebook Endpoints
// ============================================================================

/**
 * Lists all notebooks, ordered by most recently updated first.
 */
export async function listNotebooks(): Promise<Notebook[]> {
  return request<Notebook[]>('/notebooks');
}

/**
 * Creates a new notebook.
 */
export async function createNotebook(data: NotebookCreateInput): Promise<Notebook> {
  return request<Notebook>('/notebooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Retrieves a single notebook by ID.
 */
export async function getNotebook(id: string): Promise<Notebook> {
  return request<Notebook>(`/notebooks/${encodeURIComponent(id)}`);
}

/**
 * Updates a notebook's title and/or description.
 */
export async function updateNotebook(
  id: string,
  data: NotebookUpdateInput
): Promise<Notebook> {
  return request<Notebook>(`/notebooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Deletes a notebook by ID.
 */
export async function deleteNotebook(
  id: string
): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(
    `/notebooks/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

// ============================================================================
// Notebook-Scoped Source Endpoints
// ============================================================================

/**
 * Lists all persisted sources for a notebook.
 */
export async function listSources(notebookId: string): Promise<SourceDoc[]> {
  const responses = await request<BackendSourceResponse[]>(
    `/notebooks/${encodeURIComponent(notebookId)}/sources`
  );
  return responses.map(mapSourceResponseToSourceDoc);
}

/**
 * Ingests a new document source into the notebook.
 */
export async function createSource(
  notebookId: string,
  data: SourceCreateInput
): Promise<SourceDoc> {
  const response = await request<BackendSourceResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/sources`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return mapSourceResponseToSourceDoc(response);
}

/**
 * Retrieves a single source and its chunks by ID.
 */
export async function getSource(
  notebookId: string,
  sourceId: string
): Promise<SourceDoc> {
  const response = await request<BackendSourceResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`
  );
  return mapSourceResponseToSourceDoc(response);
}

/**
 * Updates a source's selection state, title, or metadata.
 */
export async function updateSource(
  notebookId: string,
  sourceId: string,
  data: SourceUpdateInput
): Promise<SourceDoc> {
  const response = await request<BackendSourceResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
  return mapSourceResponseToSourceDoc(response);
}

/**
 * Deletes a source and its chunks from a notebook.
 */
export async function deleteSource(
  notebookId: string,
  sourceId: string
): Promise<{ status: string; id: string; notebook_id: string }> {
  return request<{ status: string; id: string; notebook_id: string }>(
    `/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'DELETE',
    }
  );
}

// ============================================================================
// Notebook Semantic Retrieval Endpoints
// ============================================================================

/**
 * Executes notebook-scoped local semantic similarity search.
 */
export async function searchNotebook(
  notebookId: string,
  input: SearchRequestInput
): Promise<SearchResponse> {
  return request<SearchResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/search`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
}

/**
 * Rebuilds the persistent vector index for a notebook from its persisted SQLite sources.
 */
export async function reindexNotebook(
  notebookId: string
): Promise<ReindexResponse> {
  return request<ReindexResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/reindex`,
    {
      method: 'POST',
    }
  );
}

// ============================================================================
// Notebook Grounded AI Chat Endpoint
// ============================================================================

interface BackendChatResponse {
  answer: string;
  citations: BackendCitationItem[];
  conversation_id?: string | null;
  model: string;
  notebook_id: string;
}

/**
 * Sends a message to the notebook-scoped grounded AI chat API.
 * Maps backend citation format to frontend Citation type.
 */
export async function sendNotebookChatMessage(
  notebookId: string,
  input: ChatRequestInput
): Promise<ChatResponseOutput> {
  const backendRes = await request<BackendChatResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/chat`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );

  const mappedCitations: Citation[] = (backendRes.citations || []).map(c => ({
    index: c.index,
    sourceId: c.source_id,
    sourceTitle: c.source_title,
    snippet: c.snippet,
    page: c.page_number || undefined,
    section: c.section_name || undefined,
    score: c.similarity_score,
    chunkId: c.chunk_id,
    chunkIndex: c.chunk_index,
  }));

  return {
    answer: backendRes.answer,
    citations: mappedCitations,
    conversation_id: backendRes.conversation_id,
    model: backendRes.model,
    notebook_id: backendRes.notebook_id,
  };
}

// ============================================================================
// Notebook-Scoped Conversation & Message Endpoints
// ============================================================================

interface BackendMessageResponse {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{
    index: number;
    source_id: string;
    source_title: string;
    chunk_id?: string;
    chunk_index?: number;
    snippet: string;
    page_number?: number | null;
    section_name?: string | null;
    similarity_score?: number;
  }> | null;
  model?: string | null;
  created_at: string;
}

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return '';
}

function mapBackendMessageToChatMessage(msg: BackendMessageResponse): ChatMessage {
  const mappedCitations: Citation[] = (msg.citations || []).map((c: any) => ({
    index: c.index,
    sourceId: c.source_id,
    sourceTitle: c.source_title,
    snippet: c.snippet,
    page: c.page_number || undefined,
    section: c.section_name || undefined,
    score: c.similarity_score,
    chunkId: c.chunk_id,
    chunkIndex: c.chunk_index,
  }));

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: formatMessageTime(msg.created_at),
    citations: mappedCitations,
    model: msg.model || undefined,
    conversationId: msg.conversation_id,
  };
}

/**
 * Lists all conversations for a notebook, ordered by updated_at descending.
 */
export async function listConversations(notebookId: string): Promise<Conversation[]> {
  return request<Conversation[]>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations`
  );
}

/**
 * Creates a new conversation in the specified notebook.
 */
export async function createConversation(
  notebookId: string,
  data?: ConversationCreateInput
): Promise<Conversation> {
  return request<Conversation>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations`,
    {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }
  );
}

/**
 * Retrieves a conversation and its messages.
 */
export async function getConversation(
  notebookId: string,
  conversationId: string
): Promise<ConversationDetail> {
  interface BackendConversationDetail extends Conversation {
    messages: BackendMessageResponse[];
  }
  const res = await request<BackendConversationDetail>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations/${encodeURIComponent(conversationId)}`
  );
  return {
    ...res,
    messages: (res.messages || []).map(mapBackendMessageToChatMessage),
  };
}

/**
 * Retrieves all messages for a specific conversation in chronological order.
 */
export async function getConversationMessages(
  notebookId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  const res = await request<BackendMessageResponse[]>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations/${encodeURIComponent(conversationId)}/messages`
  );
  return res.map(mapBackendMessageToChatMessage);
}

/**
 * Renames an existing conversation.
 */
export async function updateConversation(
  notebookId: string,
  conversationId: string,
  data: ConversationUpdateInput
): Promise<Conversation> {
  return request<Conversation>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

/**
 * Deletes a conversation and cascades deletion to all its messages.
 */
export async function deleteConversation(
  notebookId: string,
  conversationId: string
): Promise<{ status: string; id: string; notebook_id: string }> {
  return request<{ status: string; id: string; notebook_id: string }>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Sends a message to a conversation. Persists user query immediately,
 * executes grounded retrieval & Ollama generation, and persists response with citations.
 */
export async function sendConversationMessage(
  notebookId: string,
  conversationId: string,
  input: ConversationMessageInput
): Promise<ConversationChatResponseOutput> {
  interface BackendConversationChatResponse {
    answer: string;
    citations: BackendCitationItem[];
    conversation_id: string;
    notebook_id: string;
    model: string;
    user_message: BackendMessageResponse;
    assistant_message: BackendMessageResponse;
  }
  const backendRes = await request<BackendConversationChatResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );

  const mappedCitations: Citation[] = (backendRes.citations || []).map(c => ({
    index: c.index,
    sourceId: c.source_id,
    sourceTitle: c.source_title,
    snippet: c.snippet,
    page: c.page_number || undefined,
    section: c.section_name || undefined,
    score: c.similarity_score,
    chunkId: c.chunk_id,
    chunkIndex: c.chunk_index,
  }));

  return {
    answer: backendRes.answer,
    citations: mappedCitations,
    conversation_id: backendRes.conversation_id,
    notebook_id: backendRes.notebook_id,
    model: backendRes.model,
    user_message: mapBackendMessageToChatMessage(backendRes.user_message),
    assistant_message: mapBackendMessageToChatMessage(backendRes.assistant_message),
  };
}


// ============================================================================
// Studio Artifact Endpoints
// ============================================================================

interface BackendArtifactResponse {
  id: string;
  notebook_id: string;
  artifact_type: string;
  title: string;
  structured_content: any;
  source_ids?: string[];
  citations?: Array<{
    index: number;
    source_id: string;
    source_title: string;
    chunk_id?: string;
    chunk_index?: number;
    snippet: string;
    page_number?: number | null;
    section_name?: string | null;
    similarity_score?: number;
  }>;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapBackendArtifactToStudioArtifact(res: BackendArtifactResponse): StudioArtifact {
  const mappedCitations: Citation[] = (res.citations || []).map(c => ({
    index: c.index,
    sourceId: c.source_id,
    sourceTitle: c.source_title,
    snippet: c.snippet,
    page: c.page_number || undefined,
    section: c.section_name || undefined,
    score: c.similarity_score,
    chunkId: c.chunk_id,
    chunkIndex: c.chunk_index,
  }));

  return {
    id: res.id,
    notebook_id: res.notebook_id,
    artifact_type: res.artifact_type,
    title: res.title,
    structured_content: res.structured_content,
    source_ids: res.source_ids || [],
    citations: mappedCitations,
    status: res.status,
    created_at: res.created_at,
    updated_at: res.updated_at,
    type: res.artifact_type,
    dialogue: res.structured_content?.dialogue,
    flashcards: res.structured_content?.cards,
  };
}

/**
 * Lists all artifacts for a notebook.
 */
export async function listArtifacts(notebookId: string, artifactType?: string): Promise<StudioArtifact[]> {
  const query = artifactType ? `?artifact_type=${encodeURIComponent(artifactType)}` : '';
  const list = await request<BackendArtifactResponse[]>(`/notebooks/${notebookId}/artifacts${query}`);
  return list.map(mapBackendArtifactToStudioArtifact);
}

/**
 * Retrieves a single artifact by ID.
 */
export async function getArtifact(notebookId: string, artifactId: string): Promise<StudioArtifact> {
  const res = await request<BackendArtifactResponse>(`/notebooks/${notebookId}/artifacts/${artifactId}`);
  return mapBackendArtifactToStudioArtifact(res);
}

/**
 * Directly creates a new artifact in the notebook.
 */
export async function createArtifact(notebookId: string, input: ArtifactCreateInput): Promise<StudioArtifact> {
  const res = await request<BackendArtifactResponse>(`/notebooks/${notebookId}/artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapBackendArtifactToStudioArtifact(res);
}

/**
 * Updates an artifact's title, content, or status.
 */
export async function updateArtifact(notebookId: string, artifactId: string, input: ArtifactUpdateInput): Promise<StudioArtifact> {
  const res = await request<BackendArtifactResponse>(`/notebooks/${notebookId}/artifacts/${artifactId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return mapBackendArtifactToStudioArtifact(res);
}

/**
 * Deletes an artifact from the notebook.
 */
export async function deleteArtifact(notebookId: string, artifactId: string): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(`/notebooks/${notebookId}/artifacts/${artifactId}`, {
    method: 'DELETE',
  });
}

/**
 * Generates and persists a functional, source-grounded artifact in the notebook.
 */
export async function generateArtifact(notebookId: string, input: ArtifactGenerateInput): Promise<StudioArtifact> {
  const res = await request<BackendArtifactResponse>(`/notebooks/${notebookId}/artifacts/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapBackendArtifactToStudioArtifact(res);
}

/**
 * Regenerates an existing studio artifact with fresh content grounded in the notebook sources.
 */
export async function regenerateArtifact(
  notebookId: string,
  artifactId: string,
  input?: ArtifactRegenerateInput
): Promise<StudioArtifact> {
  const res = await request<BackendArtifactResponse>(
    `/notebooks/${notebookId}/artifacts/${artifactId}/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify(input || {}),
    }
  );
  return mapBackendArtifactToStudioArtifact(res);
}




