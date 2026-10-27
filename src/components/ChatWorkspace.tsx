'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SourceDoc, ChatMessage, Citation, Conversation } from '../lib/types';
import { 
  listConversations, 
  createConversation, 
  getConversationMessages, 
  updateConversation, 
  deleteConversation, 
  sendConversationMessage 
} from '../lib/api-client';
import { 
  Send, 
  Copy, 
  Check, 
  BookmarkPlus, 
  FileText,
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { NotificationBanner, NotificationState } from './NotificationBanner';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatWorkspaceProps {
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
  onSaveToNotes: (title: string, content: string, citation?: Citation) => void;
  ollamaUrl: string;
  selectedModel: string;
  activeNotebookId?: string | null;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  sources,
  onOpenSourceModal,
  onSaveToNotes,
  ollamaUrl,
  selectedModel,
  activeNotebookId,
}) => {
  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  // Conversation dropdown & renaming state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Chat messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [isSavingNoteId, setIsSavingNoteId] = useState<string | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<Citation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<NotificationState | null>(null);
  const [isConfirmingDeleteConv, setIsConfirmingDeleteConv] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MIN_TEXTAREA_HEIGHT = 52; // compact height: 48–56px
  const MAX_TEXTAREA_HEIGHT = 180; // natural multiline expansion limit: 160–200px

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height temporarily to accurately compute scrollHeight from text content
    textarea.style.height = 'auto';

    // Responsively adapt max-height if viewport height is small
    const viewportLimit = typeof window !== 'undefined'
      ? Math.max(MIN_TEXTAREA_HEIGHT, Math.floor(window.innerHeight * 0.35))
      : MAX_TEXTAREA_HEIGHT;
    const effectiveMax = Math.min(MAX_TEXTAREA_HEIGHT, viewportLimit);

    const scrollHeight = textarea.scrollHeight;
    const targetHeight = Math.min(Math.max(scrollHeight, MIN_TEXTAREA_HEIGHT), effectiveMax);

    textarea.style.height = `${targetHeight}px`;
    textarea.style.overflowY = scrollHeight > effectiveMax ? 'auto' : 'hidden';
  };

  // Auto-grow textarea dynamically based on input content
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputQuery]);

  // Handle viewport and container width resizes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let lastWidth = textarea.clientWidth;
    const handleResize = () => {
      adjustTextareaHeight();
    };

    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentWidth = entry.contentRect.width;
          if (Math.abs(currentWidth - lastWidth) > 1) {
            lastWidth = currentWidth;
            adjustTextareaHeight();
          }
        }
      });
      ro.observe(textarea);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
  }, []);

  // Auto-dismiss transient notices
  useEffect(() => {
    if (!notice) return;
    if (notice.type === 'success' || notice.type === 'info') {
      const timer = setTimeout(() => setNotice(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Reset confirmation state on notebook or conversation change
  useEffect(() => {
    setIsConfirmingDeleteConv(false);
    setIsDeletingConversation(false);
  }, [activeNotebookId, activeConversation?.id]);

  // Keyboard shortcut: Escape cancels delete confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConfirmingDeleteConv) {
        setIsConfirmingDeleteConv(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmingDeleteConv]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setIsRenaming(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Load conversations when activeNotebookId changes
  useEffect(() => {
    if (!activeNotebookId) {
      setConversations([]);
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    let isCurrent = true;
    setIsLoadingConversations(true);
    setConversationError(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);

    listConversations(activeNotebookId)
      .then(async (fetchedList) => {
        if (!isCurrent) return;

        if (fetchedList.length === 0) {
          // Automatically create a default conversation if none exist
          try {
            const newConv = await createConversation(activeNotebookId, { title: 'New Conversation' });
            if (!isCurrent) return;
            setConversations([newConv]);
            setActiveConversation(newConv);
            localStorage.setItem(`orion-active-conv-${activeNotebookId}`, newConv.id);
            setMessages([]);
          } catch (createErr: any) {
            if (!isCurrent) return;
            setConversationError(createErr.message || 'Failed to initialize conversation.');
          }
        } else {
          setConversations(fetchedList);
          // Restore saved conversation or choose the most recently updated one
          const savedConvId = localStorage.getItem(`orion-active-conv-${activeNotebookId}`);
          const matched = fetchedList.find(c => c.id === savedConvId) || fetchedList[0];
          setActiveConversation(matched);
          localStorage.setItem(`orion-active-conv-${activeNotebookId}`, matched.id);

          // Fetch messages for selected conversation
          setIsLoadingMessages(true);
          try {
            const msgs = await getConversationMessages(activeNotebookId, matched.id);
            if (!isCurrent) return;
            setMessages(msgs);
          } catch (msgErr: any) {
            if (!isCurrent) return;
            setConversationError(msgErr.message || 'Failed to load messages.');
          } finally {
            if (isCurrent) setIsLoadingMessages(false);
          }
        }
      })
      .catch((err: any) => {
        if (!isCurrent) return;
        console.warn(`Failed to fetch conversations for notebook ${activeNotebookId}:`, err);
        setConversationError(err.message || 'Failed to load conversations.');
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingConversations(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeNotebookId]);

  // Load messages when activeConversation changes within the same notebook
  const handleSelectConversation = async (conv: Conversation) => {
    if (!activeNotebookId || activeConversation?.id === conv.id) return;
    setActiveConversation(conv);
    localStorage.setItem(`orion-active-conv-${activeNotebookId}`, conv.id);
    setIsLoadingMessages(true);
    setConversationError(null);

    try {
      const msgs = await getConversationMessages(activeNotebookId, conv.id);
      setMessages(msgs);
    } catch (err: any) {
      setConversationError(err.message || 'Failed to load messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Start a new conversation
  const handleCreateNewConversation = async () => {
    if (!activeNotebookId) return;
    try {
      const newConv = await createConversation(activeNotebookId, { title: 'New Conversation' });
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv);
      localStorage.setItem(`orion-active-conv-${activeNotebookId}`, newConv.id);
      setMessages([]);
      setIsDropdownOpen(false);
    } catch (err: any) {
      setConversationError(err.message || 'Failed to create new conversation.');
    }
  };

  // Rename active conversation
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNotebookId || !activeConversation || isSubmittingRename) return;
    const trimmed = renameTitle.trim();
    if (!trimmed) return;

    setIsSubmittingRename(true);
    try {
      const updated = await updateConversation(activeNotebookId, activeConversation.id, {
        title: trimmed
      });
      setActiveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
      setIsRenaming(false);
    } catch (err: any) {
      setConversationError(err.message || 'Failed to rename conversation.');
    } finally {
      setIsSubmittingRename(false);
    }
  };

  // Delete active conversation flow with integrated inline confirmation
  const handleInitiateDeleteConversation = () => {
    if (!activeNotebookId || !activeConversation || isDeletingConversation) return;
    setIsConfirmingDeleteConv(true);
  };

  const handleConfirmDeleteActiveConversation = async () => {
    if (!activeNotebookId || !activeConversation || isDeletingConversation) return;

    setIsDeletingConversation(true);
    setConversationError(null);
    const targetConvId = activeConversation.id;
    const targetTitle = activeConversation.title;

    try {
      await deleteConversation(activeNotebookId, targetConvId);
      const remaining = conversations.filter(c => c.id !== targetConvId);
      setConversations(remaining);
      setIsConfirmingDeleteConv(false);

      if (remaining.length > 0) {
        const nextActive = remaining[0];
        setActiveConversation(nextActive);
        localStorage.setItem(`orion-active-conv-${activeNotebookId}`, nextActive.id);
        const msgs = await getConversationMessages(activeNotebookId, nextActive.id);
        setMessages(msgs);
      } else {
        // Create a new blank conversation if all were deleted
        const brandNew = await createConversation(activeNotebookId, { title: 'New Conversation' });
        setConversations([brandNew]);
        setActiveConversation(brandNew);
        localStorage.setItem(`orion-active-conv-${activeNotebookId}`, brandNew.id);
        setMessages([]);
      }
      setNotice({
        type: 'success',
        message: `Conversation "${targetTitle}" was deleted.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Failed to delete conversation.',
      });
    } finally {
      setIsDeletingConversation(false);
    }
  };

  // Refresh current conversation messages
  const handleRefreshMessages = async () => {
    if (!activeNotebookId || !activeConversation) return;
    setIsLoadingMessages(true);
    try {
      const msgs = await getConversationMessages(activeNotebookId, activeConversation.id);
      setMessages(msgs);
      const refreshedList = await listConversations(activeNotebookId);
      setConversations(refreshedList);
    } catch (err: any) {
      setConversationError(err.message || 'Failed to refresh messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  // Send message to active conversation
  const handleSendMessage = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || isSending) return;

    if (!activeNotebookId) {
      setNotice({
        type: 'warning',
        message: 'Please select or create a notebook before asking questions.',
      });
      return;
    }

    let targetConv = activeConversation;
    // If no conversation exists, create one on the fly
    if (!targetConv) {
      try {
        targetConv = await createConversation(activeNotebookId, { title: 'New Conversation' });
        setConversations([targetConv]);
        setActiveConversation(targetConv);
        localStorage.setItem(`orion-active-conv-${activeNotebookId}`, targetConv.id);
      } catch (err: any) {
        setConversationError(err.message || 'Could not start conversation.');
        return;
      }
    }

    const targetConvId = targetConv.id;
    const targetNotebookId = activeNotebookId;

    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: targetConvId,
    };

    const assistantMsgId = `asst-${Date.now()}`;
    const placeholderAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: selectedModel,
      citations: [],
      conversationId: targetConvId,
    };

    // Optimistically append user message and placeholder assistant response
    setMessages(prev => [...prev, userMessage, placeholderAssistantMsg]);
    setInputQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      textareaRef.current.style.overflowY = 'hidden';
    }
    setIsSending(true);

    try {
      const selectedSourceIds = sources.filter(s => s.isSelected).map(s => s.id);
      const response = await sendConversationMessage(targetNotebookId, targetConvId, {
        message: query,
        message_id: userMsgId,
        selected_source_ids: sources.length > 0 ? selectedSourceIds : undefined,
        model: selectedModel,
      });

      // Verify request is still for the active conversation
      if (activeNotebookId === targetNotebookId && activeConversation?.id === targetConvId) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  id: response.assistant_message.id,
                  content: response.answer,
                  citations: response.citations,
                  model: response.model,
                }
              : m
          )
        );

        // Auto-update conversation title if it changed from "New Conversation"
        if (targetConv.title === 'New Conversation') {
          const updatedConvs = await listConversations(targetNotebookId);
          setConversations(updatedConvs);
          const current = updatedConvs.find(c => c.id === targetConvId);
          if (current) setActiveConversation(current);
        }
      }
    } catch (err: any) {
      let friendlyError = err.message || 'Unable to process request.';
      if (err.status === 503) {
        friendlyError = `⚠️ **Ollama Offline**\n\nCould not connect to local Ollama at \`${ollamaUrl}\`. Please make sure Ollama is installed and running (\`ollama serve\`).\n\n*Note: Your question has been saved in this conversation.*`;
      } else if (err.status === 404 && typeof err.message === 'string' && err.message.includes('Ollama model')) {
        friendlyError = `⚠️ **Model Not Found**\n\nThe model \`${selectedModel}\` is not installed in local Ollama. Run \`ollama pull ${selectedModel}\` in your terminal to download it.`;
      } else if (err.status === 504) {
        friendlyError = '⚠️ **Request Timed Out**\n\nThe local model took longer than 60 seconds to respond. You can retry with a shorter question or a more compact model.';
      } else if (err.status === 502) {
        friendlyError = '⚠️ **Model Error**\n\nThe local model returned an unexpected error response.';
      } else if (typeof friendlyError === 'string' && friendlyError.includes('Unable to connect to Orion backend')) {
        friendlyError = '⚠️ **Backend Disconnected**\n\nUnable to connect to the Orion backend at `http://localhost:8000`. Please ensure the FastAPI server is running.';
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: friendlyError,
                citations: [],
              }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveMessageToNotes = async (msg: ChatMessage) => {
    if (isSavingNoteId) return;
    setIsSavingNoteId(msg.id);
    try {
      // Strip leading markdown formatting to create a clean note title
      const cleanSnippet = msg.content
        .replace(/^[#\s*>-]+/gm, '')
        .replace(/\[\d+\]/g, '')
        .trim();
      const noteTitle = `Note: ${cleanSnippet.slice(0, 36) || 'Chat response'}...`;

      await Promise.resolve(onSaveToNotes(noteTitle, msg.content, msg.citations?.[0]));
      setSavedNoteId(msg.id);
      setTimeout(() => setSavedNoteId(null), 2500);
      setNotice({
        type: 'success',
        message: 'Note saved to your notebook notes.',
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err?.message || 'Failed to save note to your notebook.',
      });
    } finally {
      setIsSavingNoteId(null);
    }
  };

  // Render citation badges within message content
  const renderContentWithCitations = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return (
        <div className="text-inherit text-sm leading-relaxed whitespace-pre-line font-sans opacity-90">
          {content}
        </div>
      );
    }

    const parts = content.split(/(\[\d+\])/g);

    return (
      <div className="text-inherit text-sm leading-relaxed whitespace-pre-line font-sans opacity-90">
        {parts.map((part, i) => {
          const match = part.match(/\[(\d+)\]/);
          if (match) {
            const index = parseInt(match[1], 10);
            const citation = citations.find(c => c.index === index);
            if (citation) {
              const matchedSource = sources.find(s => s.id === citation.sourceId);
              const isSourceAvailable = Boolean(matchedSource);

              return (
                <button
                  key={i}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopoverPos({ x: rect.left, y: rect.bottom + 6 });
                    setHoveredCitation({
                      ...citation,
                      sourceAvailable: isSourceAvailable
                    });
                  }}
                  onMouseLeave={() => setHoveredCitation(null)}
                  onClick={() => {
                    if (matchedSource) {
                      onOpenSourceModal(matchedSource, citation.snippet);
                    }
                  }}
                  className={`badge-citation transition-opacity ${
                    isSourceAvailable 
                      ? 'cursor-pointer hover:opacity-100' 
                      : 'opacity-60 cursor-help border-dashed'
                  }`}
                  title={
                    isSourceAvailable 
                      ? `[${index}] ${citation.sourceTitle}` 
                      : `[${index}] ${citation.sourceTitle} (source removed from notebook)`
                  }
                >
                  {index}
                  {!isSourceAvailable && <span className="text-[9px] opacity-70 ml-0.5">*</span>}
                </button>
              );
            }
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  // Welcome message when conversation has no messages
  const activeCount = sources.filter(s => s.isSelected).length;
  const showWelcomeMessage = messages.length === 0;

  return (
    <div className="h-full w-full min-h-0 min-w-0 flex flex-col bg-surface-base relative">
      {/* Conversation Toolbar */}
      <div className="h-10 px-4 border-b border-surface-border bg-surface-panel/40 flex items-center justify-between gap-2 shrink-0 select-none">
        {/* Left: Conversation Switcher Dropdown & Inline Renamer */}
        <div className="relative" ref={dropdownRef}>
          {isRenaming ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center gap-1">
              <input
                type="text"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                autoFocus
                disabled={isSubmittingRename}
                className="px-2 py-0.5 rounded text-xs bg-surface-base border border-surface-borderHover focus:outline-none max-w-[200px] text-inherit"
                placeholder="Conversation title"
              />
              <button
                type="submit"
                disabled={!renameTitle.trim() || isSubmittingRename}
                className="p-1 rounded hover:bg-surface-hover text-emerald-400"
                title="Save title"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="p-1 rounded hover:bg-surface-hover opacity-60 hover:opacity-100"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover border border-transparent hover:border-surface-border transition-colors text-xs font-medium text-inherit max-w-[220px] md:max-w-[300px]"
                title="Switch conversation"
              >
                <MessageSquare className="w-3.5 h-3.5 opacity-70 shrink-0" />
                <span className="truncate">
                  {activeConversation 
                    ? activeConversation.title 
                    : (isLoadingConversations ? 'Loading conversations...' : 'Select conversation')}
                </span>
                <ChevronDown className={`w-3 h-3 opacity-60 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {activeConversation && (
                isConfirmingDeleteConv ? (
                  <div
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-base border border-rose-500/30 text-xs animate-fade-in"
                    role="alertdialog"
                    aria-label="Confirm delete conversation"
                  >
                    <span className="text-[11px] text-rose-500 font-medium">Delete chat?</span>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteActiveConversation}
                      disabled={isDeletingConversation}
                      className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                      aria-label="Confirm delete conversation"
                    >
                      {isDeletingConversation ? (
                        <RotateCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        'Yes'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDeleteConv(false)}
                      disabled={isDeletingConversation}
                      className="px-1.5 py-0.5 rounded bg-surface-hover hover:bg-surface-border text-inherit text-[10px] transition-colors"
                      aria-label="Cancel delete conversation"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        setRenameTitle(activeConversation.title);
                        setIsRenaming(true);
                      }}
                      className="p-1.5 rounded-lg hover:bg-surface-hover opacity-60 hover:opacity-100 transition-opacity"
                      title="Rename conversation"
                      aria-label="Rename conversation"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleInitiateDeleteConversation}
                      className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-rose-400 opacity-60 hover:opacity-100 transition-opacity"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-surface-panel border border-surface-border shadow-xl z-30 py-1.5 text-xs animate-fade-in">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>Conversations ({conversations.length})</span>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {conversations.length === 0 ? (
                  <div className="px-3 py-2 text-center opacity-60 text-xs">No conversations yet</div>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        handleSelectConversation(c);
                        setIsDropdownOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 hover:bg-surface-hover cursor-pointer group ${
                        activeConversation?.id === c.id ? 'bg-surface-hover font-medium' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className="w-3 h-3 opacity-60 shrink-0" />
                        <span className="truncate max-w-[170px]">{c.title}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-60 text-[10px]">
                        <span>{c.message_count ?? 0} msgs</span>
                        {activeConversation?.id === c.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-surface-border/50 pt-1 px-1">
                <button
                  onClick={handleCreateNewConversation}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-xs font-medium text-inherit transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 opacity-70" />
                  <span>Start new conversation</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Actions: Error Alert, Refresh & New Chat Button */}
        <div className="flex items-center gap-1.5">
          {conversationError && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1 truncate max-w-[180px]" title={conversationError}>
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{conversationError}</span>
            </span>
          )}

          <button
            onClick={handleRefreshMessages}
            disabled={isLoadingMessages}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-inherit opacity-60 hover:opacity-100 transition-colors"
            title="Refresh messages from database"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleCreateNewConversation}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-surface-borderHover border border-surface-border text-xs font-medium text-inherit transition-colors"
            title="Start a new conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 sm:px-6 md:px-8 py-4 sm:py-5 space-y-4">
        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center h-48 opacity-50 text-xs">
            <span className="animate-pulse">Loading conversation history...</span>
          </div>
        ) : showWelcomeMessage ? (
          /* Initial Welcome Message */
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] rounded-2xl p-4 bg-surface-panel border border-surface-border text-inherit shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-1.5 text-xs font-medium opacity-50">
                <span>Orion</span>
                <span className="text-[10px] font-mono">Ready</span>
              </div>
              <div className="text-inherit text-sm leading-relaxed whitespace-pre-line font-sans opacity-90">
                {sources.length === 0
                  ? 'Add your source documents on the left to start your research.'
                  : `${activeCount} source document${activeCount === 1 ? '' : 's'} active in this notebook. Ask any question to retrieve grounded answers with inline citations.`}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 transition-all ${
                  msg.role === 'user'
                    ? 'bg-surface-hover border border-surface-borderHover text-inherit'
                    : 'bg-surface-panel border border-surface-border text-inherit shadow-sm'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between gap-3 mb-1.5 text-xs font-medium opacity-50">
                  <span>{msg.role === 'user' ? 'You' : 'Orion'}</span>
                  <span className="text-[10px] font-mono">{msg.timestamp}</span>
                </div>

                {/* Message Content */}
                {msg.role === 'assistant' && !msg.content ? (
                  <div className="flex items-center gap-2.5 text-xs opacity-70 py-1 font-sans">
                    <span className="w-2 h-2 rounded-full bg-foreground-base animate-pulse"></span>
                    <span>Searching sources and generating grounded answer...</span>
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="text-inherit text-sm leading-relaxed whitespace-pre-line font-sans opacity-90">
                    {msg.content}
                  </div>
                ) : (
                  <MarkdownRenderer
                    content={msg.content}
                    citations={msg.citations}
                    sources={sources}
                    onOpenSourceModal={onOpenSourceModal}
                    onHoverCitation={(cit, pos) => {
                      setHoveredCitation(cit);
                      setPopoverPos(pos);
                    }}
                  />
                )}

                {/* Explicit Sources Cited Drawer */}
                {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-surface-border/50">
                    <div className="text-[11px] font-medium opacity-60 mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      <span>Sources Cited ({msg.citations.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((c) => {
                        const matchedSource = sources.find(s => s.id === c.sourceId);
                        const isAvailable = Boolean(matchedSource);

                        return (
                          <button
                            key={`cit-pill-${c.index}-${c.sourceId}`}
                            onClick={() => {
                              if (matchedSource) onOpenSourceModal(matchedSource, c.snippet);
                            }}
                            title={
                              isAvailable
                                ? `Click to view in source: "${c.snippet}"`
                                : `Original source document was removed from notebook. Historical snippet: "${c.snippet}"`
                            }
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-inherit transition-colors border text-left ${
                              isAvailable
                                ? 'bg-surface-hover hover:bg-surface-borderHover border-surface-border cursor-pointer'
                                : 'bg-surface-base border-surface-border/60 opacity-65 cursor-help'
                            }`}
                          >
                            <span className="font-mono font-semibold text-accent opacity-90">[{c.index}]</span>
                            <span className="truncate max-w-[160px] font-medium">{c.sourceTitle}</span>
                            {c.page && <span className="opacity-60 text-[10px]">p.{c.page}</span>}
                            {!isAvailable && (
                              <span className="text-[9px] opacity-60 italic">(removed)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Toolbar */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="mt-3 pt-2 border-t border-surface-border flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.content, msg.id)}
                      className="p-1.5 rounded-md hover:bg-surface-hover text-xs text-inherit opacity-60 hover:opacity-100 transition-colors"
                      title={copiedId === msg.id ? "Copied" : "Copy message"}
                      aria-label="Copy message"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveMessageToNotes(msg)}
                      disabled={isSavingNoteId === msg.id}
                      className="p-1.5 rounded-md hover:bg-surface-hover text-xs text-inherit opacity-60 hover:opacity-100 transition-colors disabled:opacity-40"
                      title={savedNoteId === msg.id ? "Saved to notes" : isSavingNoteId === msg.id ? "Saving to notes..." : "Save to notes"}
                      aria-label="Save message to notebook notes"
                    >
                      {savedNoteId === msg.id ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : isSavingNoteId === msg.id ? (
                        <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                      ) : (
                        <BookmarkPlus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Popover */}
      {hoveredCitation && popoverPos && (
        <div
          style={{ top: `${popoverPos.y}px`, left: `${Math.min(popoverPos.x, window.innerWidth - 300)}px` }}
          className="fixed z-50 w-72 p-3 rounded-xl bg-surface-panel border border-surface-borderHover shadow-xl text-xs pointer-events-none animate-fade-in"
        >
          <div className="font-medium mb-1 flex items-center justify-between opacity-90">
            <span>Citation [{hoveredCitation.index}]</span>
            <span className="text-[10px] opacity-60">
              {hoveredCitation.sourceAvailable !== false
                ? (hoveredCitation.page ? `Page ${hoveredCitation.page}` : hoveredCitation.section || 'Source')
                : 'Source removed'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed italic opacity-70">
            "{hoveredCitation.snippet}"
          </p>
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div className="px-4 pt-2 shrink-0">
          <NotificationBanner
            type={notice.type}
            message={notice.message}
            onDismiss={() => setNotice(null)}
          />
        </div>
      )}

      {/* Input Box */}
      <div className="p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface-base shrink-0 border-t border-surface-border/40">
        <div className="max-w-4xl mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative rounded-2xl bg-surface-panel border border-surface-border focus-within:border-surface-borderHover shadow-sm flex flex-col transition-colors"
          >
            <textarea
              ref={textareaRef}
              value={inputQuery}
              onChange={(e) => {
                setInputQuery(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              onFocus={() => {
                setTimeout(() => {
                  textareaRef.current?.scrollIntoView({ block: 'nearest' });
                }, 250);
              }}
              placeholder={
                sources.length === 0 
                  ? "Add a source on the left to start..." 
                  : "Ask a question about your sources..."
              }
              rows={1}
              disabled={isSending}
              style={{ minHeight: `${MIN_TEXTAREA_HEIGHT}px`, maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
              className="w-full bg-transparent text-sm px-4 py-3.5 focus:outline-none resize-none font-sans text-inherit placeholder:opacity-40 disabled:opacity-50 leading-relaxed block overflow-y-hidden"
            />

            <div className="flex items-center justify-between px-3.5 pb-2.5 pt-1.5 border-t border-surface-border/40 shrink-0">
              <div className="flex items-center gap-2 text-[11px] opacity-40 select-none">
                <span className="hidden sm:inline">Use Shift + Enter for new line</span>
              </div>
              <button
                type="submit"
                disabled={!inputQuery.trim() || isSending}
                className="p-1.5 rounded-xl bg-foreground-base text-surface-base hover:opacity-90 disabled:opacity-20 transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed"
                title="Send message"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
