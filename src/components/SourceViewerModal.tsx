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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white border border-zinc-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-200/80 text-zinc-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 truncate max-w-md md:max-w-xl">
                {source.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mt-0.5">
                <span>{source.wordCount} words</span>
                <span>•</span>
                <span>{source.chunks.length} RAG Chunks</span>
                <span>•</span>
                <span>{source.type.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs flex items-center gap-1.5 transition-colors"
              title="Copy text"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Highlight Alert */}
        {highlightText && (
          <div className="px-6 py-2.5 bg-zinc-100 border-b border-zinc-200 text-xs text-zinc-800 flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <span>
              <strong>Referenced Excerpt:</strong> "{highlightText.slice(0, 140)}..."
            </span>
          </div>
        )}

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {source.summary && (
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Document Summary
              </h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {source.summary}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Document Text
            </h4>
            <div className="p-4 rounded-xl bg-zinc-50/60 border border-zinc-200 font-mono text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">
              {source.content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
