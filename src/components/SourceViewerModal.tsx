'use client';

import React, { useState } from 'react';
import { SourceDoc } from '../lib/types';
import { X, FileText, Bookmark, Copy, Check } from 'lucide-react';

interface SourceViewerModalProps {
  source: SourceDoc | null;
  highlightText?: string;
  onClose: () => void;
}

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({
  source,
  highlightText,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  if (!source) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(source.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chunkCount = source.chunks?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] bg-surface-panel border border-surface-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-inherit">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-surface-border flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="p-2 rounded-xl bg-surface-base border border-surface-border text-inherit opacity-90 shrink-0">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-inherit truncate max-w-md md:max-w-xl">
                {source.title}
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono opacity-60 mt-0.5">
                <span>{source.wordCount} words</span>
                <span>•</span>
                <span>{chunkCount} RAG Chunks</span>
                <span>•</span>
                <span className="uppercase">{source.type}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-surface-base hover:bg-surface-hover border border-surface-border text-inherit opacity-80 hover:opacity-100 text-xs flex items-center gap-1.5 transition-colors"
              title="Copy text"
              aria-label="Copy text"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-surface-base hover:bg-surface-hover border border-surface-border text-inherit opacity-70 hover:opacity-100 transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Highlight Alert */}
        {highlightText && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">
              <strong>Referenced Excerpt:</strong> "{highlightText.slice(0, 140)}..."
            </span>
          </div>
        )}

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {source.summary && (
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border">
              <h4 className="text-xs font-semibold opacity-70 uppercase tracking-wider mb-1">
                Document Summary
              </h4>
              <p className="text-xs opacity-90 leading-relaxed">
                {source.summary}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold opacity-60 uppercase tracking-wider">
              Document Text
            </h4>
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border font-mono text-xs opacity-90 whitespace-pre-wrap leading-relaxed select-text">
              {source.content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-surface-border bg-surface-panel flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-black dark:hover:bg-zinc-100 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
