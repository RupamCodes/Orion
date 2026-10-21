'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SourceDoc, ChatMessage, Citation } from '../lib/types';
import { generateRAGAnswer } from '../lib/local-rag';
import { 
  Send, 
  Copy, 
  Check, 
  BookmarkPlus
} from 'lucide-react';

interface ChatWorkspaceProps {
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
  onSaveToNotes: (title: string, content: string, citation?: Citation) => void;
  ollamaUrl: string;
  selectedModel: string;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  sources,
  onOpenSourceModal,
  onSaveToNotes,
  ollamaUrl,
  selectedModel,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<Citation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sources.length === 0) {
      setMessages([
        {
          id: 'welcome-empty',
          role: 'assistant',
          content: `Add your source documents on the left to start.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citations: []
        }
      ]);
    } else if (messages.length <= 1) {
      setMessages([
        {
          id: 'welcome-ready',
          role: 'assistant',
          content: `${sources.filter(s => s.isSelected).length} source documents active. Ask any question about them.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citations: []
        }
      ]);
    }
  }, [sources.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: selectedModel,
      citations: []
    };

    setMessages(prev => [...prev, initialAssistantMsg]);

    try {
      const response = await generateRAGAnswer(
        query,
        sources,
        messages,
        ollamaUrl,
        selectedModel,
        (token) => {
          setMessages(prev =>
            prev.map(m => (m.id === assistantMsgId ? { ...m, content: m.content + token } : m))
          );
        }
      );

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: response.text,
                citations: response.citations
              }
            : m
        )
      );
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: "Unable to process request."
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderContentWithCitations = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return <div className="text-inherit text-sm leading-relaxed whitespace-pre-line font-sans opacity-90">{content}</div>;
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
              return (
                <button
                  key={i}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopoverPos({ x: rect.left, y: rect.bottom + 6 });
                    setHoveredCitation(citation);
                  }}
                  onMouseLeave={() => setHoveredCitation(null)}
                  onClick={() => {
                    const src = sources.find(s => s.id === citation.sourceId);
                    if (src) onOpenSourceModal(src, citation.snippet);
                  }}
                  className="badge-citation"
                >
                  {index}
                </button>
              );
            }
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-surface-base relative">
      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 space-y-4">
        {messages.map((msg) => (
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
              {renderContentWithCitations(msg.content, msg.citations)}

              {/* Action Toolbar */}
              {msg.role === 'assistant' && msg.content && (
                <div className="mt-3 pt-2 border-t border-surface-border flex items-center justify-end gap-1">
                  <button
                    onClick={() => copyToClipboard(msg.content, msg.id)}
                    className="p-1.5 rounded-md hover:bg-surface-hover text-xs text-inherit opacity-60 hover:opacity-100 transition-colors"
                    title="Copy"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onSaveToNotes(`Note: ${msg.content.slice(0, 30)}...`, msg.content, msg.citations?.[0])}
                    className="p-1.5 rounded-md hover:bg-surface-hover text-xs text-inherit opacity-60 hover:opacity-100 transition-colors"
                    title="Save to notes"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start">
            <div className="p-3 rounded-2xl bg-surface-panel border border-surface-border text-xs opacity-60 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground-base animate-pulse"></span>
              <span>Searching sources...</span>
            </div>
          </div>
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
            <span className="text-[10px] opacity-60">Page {hoveredCitation.page || 1}</span>
          </div>
          <p className="text-[11px] leading-relaxed italic opacity-70">
            "{hoveredCitation.snippet}"
          </p>
        </div>
      )}

      {/* Input Box */}
      <div className="p-4 bg-surface-base">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative rounded-2xl bg-surface-panel border border-surface-border focus-within:border-surface-borderHover shadow-sm flex flex-col"
          >
            <textarea
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={sources.length === 0 ? "Add a source on the left to start..." : "Ask a question about your sources..."}
              rows={2}
              className="w-full bg-transparent text-sm p-4 pr-12 focus:outline-none resize-none font-sans text-inherit placeholder:opacity-40"
            />

            <div className="flex items-center justify-end px-3 pb-2 pt-1 border-t border-surface-border border-opacity-50">
              <button
                type="submit"
                disabled={!inputQuery.trim() || isLoading}
                className="p-1.5 rounded-xl bg-foreground-base text-surface-base hover:opacity-90 disabled:opacity-20 transition-all flex items-center justify-center"
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
