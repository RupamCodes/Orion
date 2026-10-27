'use client';

import React, { useState } from 'react';
import { Citation, SourceDoc } from '../lib/types';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  sources?: SourceDoc[];
  onOpenSourceModal?: (source: SourceDoc, highlightText?: string) => void;
  onHoverCitation?: (citation: Citation | null, pos: { x: number; y: number } | null) => void;
  className?: string;
}

type BlockToken =
  | { type: 'code'; language: string; code: string }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'p'; text: string };

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  citations = [],
  sources = [],
  onOpenSourceModal,
  onHoverCitation,
  className = '',
}) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  // Helper to parse text into blocks
  const parseBlocks = (raw: string): BlockToken[] => {
    if (!raw) return [];
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const blocks: BlockToken[] = [];

    let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let currentParagraph: string[] = [];
    let currentBlockquote: string[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];

    const flushList = () => {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
    };

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        blocks.push({ type: 'p', text: currentParagraph.join('\n') });
        currentParagraph = [];
      }
    };

    const flushBlockquote = () => {
      if (currentBlockquote.length > 0) {
        blocks.push({ type: 'blockquote', text: currentBlockquote.join('\n') });
        currentBlockquote = [];
      }
    };

    const flushAll = () => {
      flushList();
      flushParagraph();
      flushBlockquote();
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code Block handling
      if (inCodeBlock) {
        if (line.trim().startsWith('```')) {
          blocks.push({
            type: 'code',
            language: codeLanguage,
            code: codeLines.join('\n'),
          });
          inCodeBlock = false;
          codeLanguage = '';
          codeLines = [];
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (line.trim().startsWith('```')) {
        flushAll();
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim();
        codeLines = [];
        continue;
      }

      // Horizontal Rule
      if (/^(?:---|\*\*\*|___)\s*$/.test(line.trim())) {
        flushAll();
        blocks.push({ type: 'hr' });
        continue;
      }

      // Headings (#, ##, ###, ####)
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushAll();
        const level = headingMatch[1].length as 1 | 2 | 3 | 4;
        blocks.push({
          type: 'heading',
          level,
          text: headingMatch[2].trim(),
        });
        continue;
      }

      // Blockquote (> )
      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushList();
        flushParagraph();
        currentBlockquote.push(quoteMatch[1]);
        continue;
      } else {
        flushBlockquote();
      }

      // Unordered list item (- or *)
      const ulMatch = line.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== 'ul') {
          flushList();
          currentList = { type: 'ul', items: [] };
        }
        currentList.items.push(ulMatch[1].trim());
        continue;
      }

      // Ordered list item (1. )
      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== 'ol') {
          flushList();
          currentList = { type: 'ol', items: [] };
        }
        currentList.items.push(olMatch[1].trim());
        continue;
      }

      // Empty line -> flush list and paragraph
      if (!line.trim()) {
        flushAll();
        continue;
      }

      // Regular line inside paragraph
      flushList();
      currentParagraph.push(line);
    }

    if (inCodeBlock) {
      blocks.push({
        type: 'code',
        language: codeLanguage,
        code: codeLines.join('\n'),
      });
    }

    flushAll();
    return blocks;
  };

  // Helper to parse inline markdown (bold, italic, inline code, citations, links)
  const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    if (!text) return [];

    // Tokens:
    // 1. Citations: [1], [2], etc.
    // 2. Inline code: `code`
    // 3. Bold-italic: ***text*** or ___text___
    // 4. Bold: **text** or __text__
    // 5. Italic: *text* or _text_
    // 6. Links: [label](url)
    const tokenRegex = /(\[\d+\]|`[^`\n]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (!part) return null;

      // Check Citation [n]
      const citMatch = part.match(/^\[(\d+)\]$/);
      if (citMatch) {
        const citIndex = parseInt(citMatch[1], 10);
        const citation = citations.find(c => c.index === citIndex);
        if (citation) {
          const matchedSource = sources.find(s => s.id === citation.sourceId);
          const isSourceAvailable = Boolean(matchedSource);

          return (
            <button
              key={key}
              type="button"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onHoverCitation?.(
                  { ...citation, sourceAvailable: isSourceAvailable },
                  { x: rect.left, y: rect.bottom + 6 }
                );
              }}
              onMouseLeave={() => onHoverCitation?.(null, null)}
              onClick={() => {
                if (matchedSource && onOpenSourceModal) {
                  onOpenSourceModal(matchedSource, citation.snippet);
                }
              }}
              className={`badge-citation transition-opacity inline-flex items-center justify-center ${
                isSourceAvailable
                  ? 'cursor-pointer hover:opacity-100'
                  : 'opacity-60 cursor-help border-dashed'
              }`}
              title={
                isSourceAvailable
                  ? `[${citIndex}] ${citation.sourceTitle}`
                  : `[${citIndex}] ${citation.sourceTitle} (source removed from notebook)`
              }
              aria-label={`Citation [${citIndex}] from ${citation.sourceTitle}`}
            >
              {citIndex}
              {!isSourceAvailable && <span className="text-[9px] opacity-70 ml-0.5">*</span>}
            </button>
          );
        }
      }

      // Inline code `...`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        const codeContent = part.slice(1, -1);
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-surface-base border border-surface-border text-indigo-400 dark:text-indigo-300 font-medium"
          >
            {codeContent}
          </code>
        );
      }

      // Bold & Italic ***...*** or ___...___
      if ((part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
          (part.startsWith('___') && part.endsWith('___') && part.length >= 6)) {
        return (
          <strong key={key} className="font-bold text-inherit opacity-100">
            <em className="italic">{part.slice(3, -3)}</em>
          </strong>
        );
      }

      // Bold **...** or __...__
      if ((part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
          (part.startsWith('__') && part.endsWith('__') && part.length >= 4)) {
        return (
          <strong key={key} className="font-semibold text-inherit opacity-100">
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Italic *...* or _..._
      if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
          (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
        return (
          <em key={key} className="italic text-inherit opacity-95">
            {part.slice(1, -1)}
          </em>
        );
      }

      // Markdown Link [label](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            {linkMatch[1]}
          </a>
        );
      }

      // Plain text (handles linebreaks in multiline paragraph text)
      if (part.includes('\n')) {
        const subLines = part.split('\n');
        return (
          <React.Fragment key={key}>
            {subLines.map((s, idx) => (
              <React.Fragment key={idx}>
                {s}
                {idx < subLines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      }

      return <span key={key}>{part}</span>;
    });
  };

  const blocks = parseBlocks(content);

  return (
    <div className={`text-inherit text-sm leading-relaxed font-sans opacity-95 space-y-2.5 ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const headingClasses = {
              1: 'text-base font-bold text-inherit mt-3 mb-1.5 opacity-100 tracking-tight',
              2: 'text-sm font-bold text-inherit mt-2.5 mb-1 opacity-95 tracking-tight',
              3: 'text-xs font-semibold text-inherit mt-2 mb-1 opacity-90 uppercase tracking-wide',
              4: 'text-xs font-semibold text-inherit mt-1.5 mb-0.5 opacity-85',
            }[block.level];

            return (
              <div key={idx} className={headingClasses}>
                {renderInline(block.text, `h-${idx}`)}
              </div>
            );
          }

          case 'code': {
            const isCopied = copiedCodeIdx === idx;
            return (
              <div
                key={idx}
                className="my-3 rounded-xl overflow-hidden border border-surface-border bg-surface-base/90 text-inherit font-mono text-xs shadow-sm"
              >
                <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface-panel/80 border-b border-surface-border text-[11px] opacity-75">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {block.language || 'code'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(block.code, idx)}
                    className="flex items-center gap-1 hover:text-foreground-base transition-colors opacity-80 hover:opacity-100"
                    title="Copy code block"
                    aria-label="Copy code block"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 overflow-x-auto whitespace-pre leading-relaxed text-[12px] font-mono select-text">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          }

          case 'ul': {
            return (
              <ul key={idx} className="my-1.5 pl-5 list-disc space-y-1 text-inherit opacity-90 text-sm">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInline(item, `ul-${idx}-${itemIdx}`)}
                  </li>
                ))}
              </ul>
            );
          }

          case 'ol': {
            return (
              <ol key={idx} className="my-1.5 pl-5 list-decimal space-y-1 text-inherit opacity-90 text-sm">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInline(item, `ol-${idx}-${itemIdx}`)}
                  </li>
                ))}
              </ol>
            );
          }

          case 'blockquote': {
            return (
              <blockquote
                key={idx}
                className="my-2 pl-3 py-1 border-l-2 border-indigo-500/60 italic opacity-85 text-xs bg-indigo-500/5 rounded-r-lg"
              >
                {renderInline(block.text, `quote-${idx}`)}
              </blockquote>
            );
          }

          case 'hr': {
            return <hr key={idx} className="my-3 border-surface-border/60" />;
          }

          case 'p':
          default: {
            return (
              <div key={idx} className="leading-relaxed">
                {renderInline(block.text, `p-${idx}`)}
              </div>
            );
          }
        }
      })}
    </div>
  );
};
