'use client';

import React, { useState } from 'react';
import { StudioArtifact, SourceDoc, ReportData, ReportSection } from '../../lib/types';
import { 
  FileText, 
  Copy, 
  Check, 
  Sparkles, 
  ExternalLink, 
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  BookmarkCheck
} from 'lucide-react';

interface ReportViewProps {
  artifact: StudioArtifact;
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  artifact,
  sources,
  onOpenSourceModal,
}) => {
  const [copied, setCopied] = useState(false);
  const data: ReportData = artifact.structured_content || {
    summary: '',
    key_findings: [],
    sections: []
  };

  const handleCopyMarkdown = () => {
    let md = data.markdown;
    if (!md) {
      // Assemble markdown if not pre-assembled
      const parts = [
        `# ${artifact.title}\n`,
        `## Executive Summary\n${data.summary}\n`,
        `## Key Findings\n${(data.key_findings || []).map(k => `- ${k}`).join('\n')}\n`
      ];
      (data.sections || []).forEach(s => {
        parts.push(`### ${s.heading}\n${s.content}\n`);
        if (s.key_takeaways) {
          parts.push(`**Key Takeaways:**\n${s.key_takeaways.map(t => `- ${t}`).join('\n')}\n`);
        }
      });
      if (data.inferences_and_strategic_notes) {
        parts.push(`## Strategic Inferences & Analysis\n> ${data.inferences_and_strategic_notes}\n`);
      }
      md = parts.join('\n');
    }

    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCitationClick = (citationIndex: number) => {
    const cit = (artifact.citations || []).find(c => c.index === citationIndex);
    if (cit) {
      const targetSource = sources.find(s => s.id === cit.sourceId) || sources[0];
      if (targetSource) {
        onOpenSourceModal(targetSource, cit.snippet);
      }
    }
  };

  // Helper to render inline citation markers like [1], [2] as interactive chips
  const renderGroundedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const citIdx = parseInt(match[1], 10);
        return (
          <button
            key={idx}
            onClick={() => handleCitationClick(citIdx)}
            title={`View evidence [${citIdx}] in source`}
            className="inline-flex items-center px-1 py-0 mx-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 border border-indigo-500/40 transition-colors align-baseline"
          >
            [{citIdx}]
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4 text-xs select-text">
      {/* Report Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-border">
        <div className="flex items-center gap-1.5 opacity-90">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-sm truncate max-w-[200px]">
            {artifact.title}
          </span>
        </div>

        <button
          onClick={handleCopyMarkdown}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs font-medium transition-colors opacity-80 hover:opacity-100"
          title="Copy Markdown to Clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Markdown</span>
            </>
          )}
        </button>
      </div>

      {/* Executive Summary Card */}
      {data.summary && (
        <div className="p-3.5 rounded-xl bg-surface-panel border border-surface-border space-y-1.5">
          <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Executive Summary</span>
          </div>
          <p className="text-xs leading-relaxed opacity-90">
            {renderGroundedText(data.summary)}
          </p>
        </div>
      )}

      {/* Key Findings Card */}
      {data.key_findings && data.key_findings.length > 0 && (
        <div className="p-3.5 rounded-xl bg-surface-base border border-surface-border space-y-2">
          <div className="text-[11px] font-semibold opacity-90 flex items-center gap-1">
            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Core Findings</span>
          </div>
          <ul className="space-y-1.5">
            {data.key_findings.map((finding, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed opacity-85">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <div>{renderGroundedText(finding)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections List */}
      <div className="space-y-3">
        {(data.sections || []).map((sec, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-surface-panel border border-surface-border space-y-2"
          >
            <h4 className="font-semibold text-xs opacity-95 text-indigo-300">
              {sec.heading}
            </h4>
            <div className="text-xs leading-relaxed opacity-85 space-y-2">
              <p>{renderGroundedText(sec.content)}</p>
            </div>

            {sec.key_takeaways && sec.key_takeaways.length > 0 && (
              <div className="pt-2 border-t border-surface-border/50 text-[11px] opacity-80 space-y-1">
                <span className="font-semibold text-[10px] uppercase tracking-wider opacity-60">
                  Key Takeaways:
                </span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {sec.key_takeaways.map((t, tIdx) => (
                    <li key={tIdx}>{renderGroundedText(t)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Strategic Inferences & Analysis Callout (Distinguished from source facts) */}
      {data.inferences_and_strategic_notes && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/30 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px] uppercase tracking-wider">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Strategic Inference & Deductions</span>
          </div>
          <p className="text-xs leading-relaxed opacity-85 italic">
            {data.inferences_and_strategic_notes}
          </p>
          <div className="text-[10px] opacity-50 pt-1">
            Note: Inferences are derived logically but clearly distinguished from verified source citations.
          </div>
        </div>
      )}

      {/* Document Citations Footer */}
      {artifact.citations && artifact.citations.length > 0 && (
        <div className="p-3 rounded-xl bg-surface-base border border-surface-border space-y-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wider opacity-60 text-[10px]">
            Referenced Source Evidence ({artifact.citations.length})
          </span>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {artifact.citations.map((c) => (
              <div
                key={c.index}
                onClick={() => handleCitationClick(c.index)}
                className="p-1.5 rounded hover:bg-surface-hover cursor-pointer flex items-center justify-between transition-colors opacity-80 hover:opacity-100"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-mono text-indigo-400 font-bold">[{c.index}]</span>
                  <span className="truncate max-w-[200px]">{c.sourceTitle}</span>
                </div>
                <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
