'use client';

import React, { useState, useEffect } from 'react';
import { StudioArtifact, SourceDoc, InfographicData } from '../../lib/types';
import { 
  PieChart, 
  Download, 
  Sparkles, 
  TrendingUp, 
  CheckCircle, 
  Layers, 
  ExternalLink,
  GitBranch,
  Columns,
  Check,
  RotateCw
} from 'lucide-react';
import { NotificationBanner, NotificationState } from '../NotificationBanner';

interface InfographicViewProps {
  artifact: StudioArtifact;
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
}

export const InfographicView: React.FC<InfographicViewProps> = ({
  artifact,
  sources,
  onOpenSourceModal,
}) => {
  const data: InfographicData = artifact.structured_content || {
    stats: [],
    key_takeaways: [],
    process_steps: []
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [notice, setNotice] = useState<NotificationState | null>(null);

  // Auto-dismiss transient export notices
  useEffect(() => {
    if (!notice) return;
    if (notice.type === 'success' || notice.type === 'info') {
      const timer = setTimeout(() => setNotice(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Helper to escape XML/SVG characters so output is always valid XML
  const escapeXml = (str: string = ''): string => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper to verify SVG is well-formed XML before offering it for download
  const validateSvg = (svgContent: string): boolean => {
    if (typeof window !== 'undefined' && window.DOMParser) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error(`Invalid SVG generated: ${parserError.textContent?.slice(0, 100) || 'XML syntax error'}`);
      }
    }
    return true;
  };

  const handleExportSVG = async () => {
    if (isExporting) return; // Prevent duplicate rapid clicks
    setIsExporting(true);

    try {
      // Generate standalone SVG representing the visual infographic
      const rawTitle = artifact.title || 'Infographic';
      const rawSubtitle = data.subtitle || 'Research Analysis';
      const stats = data.stats || [];
      const takeaways = data.key_takeaways || [];
      const steps = data.process_steps || [];

      const statsSvg = stats.map((s, idx) => `
        <g transform="translate(${40 + idx * 260}, 160)">
          <rect width="240" height="110" rx="16" fill="#18181b" stroke="#27272a" stroke-width="1.5"/>
          <text x="20" y="44" fill="#818cf8" font-size="28" font-weight="bold" font-family="system-ui, sans-serif">${escapeXml(s.value)}</text>
          <text x="20" y="72" fill="#f4f4f5" font-size="13" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(s.label)}</text>
          <text x="20" y="92" fill="#a1a1aa" font-size="11" font-family="system-ui, sans-serif">${escapeXml((s.context || '').slice(0, 32))}</text>
        </g>
      `).join('');

      const takeawaysSvg = takeaways.slice(0, 3).map((t, idx) => `
        <g transform="translate(40, ${310 + idx * 60})">
          <rect width="780" height="48" rx="12" fill="#18181b" stroke="#27272a" stroke-width="1"/>
          <circle cx="28" cy="24" r="8" fill="#10b981"/>
          <text x="50" y="29" fill="#f4f4f5" font-size="13" font-family="system-ui, sans-serif">${escapeXml(t.slice(0, 85))}</text>
        </g>
      `).join('');

      const stepsSvg = steps.slice(0, 3).map((st, idx) => `
        <g transform="translate(${40 + idx * 260}, 530)">
          <rect width="240" height="100" rx="14" fill="#18181b" stroke="#3b82f6" stroke-width="1.5"/>
          <circle cx="28" cy="26" r="12" fill="#3b82f6"/>
          <text x="24" y="31" fill="#ffffff" font-size="12" font-weight="bold" font-family="system-ui, sans-serif">${escapeXml(String(st.step))}</text>
          <text x="50" y="30" fill="#f4f4f5" font-size="13" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(st.title.slice(0, 20))}</text>
          <text x="20" y="65" fill="#a1a1aa" font-size="11" font-family="system-ui, sans-serif">${escapeXml(st.description.slice(0, 38))}</text>
        </g>
      `).join('');

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 680" width="860" height="680" style="background:#09090b;">
  <rect width="860" height="680" fill="#09090b"/>
  <!-- Header -->
  <text x="40" y="60" fill="#818cf8" font-size="12" font-weight="bold" letter-spacing="2" font-family="system-ui, sans-serif">ORION STUDIO INFOGRAPHIC</text>
  <text x="40" y="95" fill="#ffffff" font-size="24" font-weight="bold" font-family="system-ui, sans-serif">${escapeXml(rawTitle)}</text>
  <text x="40" y="125" fill="#a1a1aa" font-size="14" font-family="system-ui, sans-serif">${escapeXml(rawSubtitle)}</text>
  
  <!-- Stats Section -->
  ${statsSvg}

  <!-- Key Takeaways -->
  ${takeawaysSvg}

  <!-- Workflow / Steps -->
  ${stepsSvg}
</svg>`.trim();

      // Verify the generated SVG is valid XML
      validateSvg(svgContent);

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${rawTitle.toLowerCase().replace(/\s+/g, '_')}_infographic.svg`;
      link.click();
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
      setNotice({
        type: 'success',
        message: 'Infographic exported as SVG successfully.',
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err?.message || 'Failed to export SVG file.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenSource = (citationIndex?: number) => {
    let cit = null;
    if (citationIndex) {
      cit = (artifact.citations || []).find(c => c.index === citationIndex);
    }
    const targetSource = cit ? sources.find(s => s.id === cit.sourceId) : sources[0];
    if (targetSource) {
      onOpenSourceModal(targetSource, cit?.snippet);
    }
  };

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Header with Export SVG Button */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-border">
        <div className="flex items-center gap-1.5 opacity-90">
          <PieChart className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-sm truncate max-w-[190px]">
            {artifact.title}
          </span>
        </div>

        <button
          type="button"
          onClick={handleExportSVG}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs font-medium transition-colors opacity-85 hover:opacity-100 shadow-sm disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Download vector SVG layout"
          aria-label="Export Infographic as SVG"
        >
          {exportSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Exported</span>
            </>
          ) : isExporting ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Export SVG</span>
            </>
          )}
        </button>
      </div>

      {/* Action Notice Banner */}
      {notice && (
        <div className="animate-fade-in">
          <NotificationBanner
            type={notice.type}
            message={notice.message}
            onDismiss={() => setNotice(null)}
          />
        </div>
      )}

      {/* Subtitle / Scope Banner */}
      {data.subtitle && (
        <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 via-surface-panel to-transparent border border-indigo-500/20 text-xs opacity-90">
          <p className="font-medium text-[11px] leading-relaxed text-indigo-200">
            {data.subtitle}
          </p>
        </div>
      )}

      {/* 1. Stat Cards Dashboard Grid */}
      {data.stats && data.stats.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            Core Metrics & Pillars
          </span>
          <div className="grid grid-cols-2 gap-2">
            {data.stats.map((stat, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-surface-panel border border-surface-border space-y-1 hover:border-surface-borderHover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-indigo-400">
                    {stat.value}
                  </span>
                  {stat.source_ref && (
                    <span className="text-[10px] font-mono opacity-50 px-1 py-0.5 rounded bg-surface-base">
                      {stat.source_ref}
                    </span>
                  )}
                </div>
                <div className="font-medium text-xs opacity-95">
                  {stat.label}
                </div>
                {stat.context && (
                  <p className="text-[10px] opacity-60 line-clamp-2">
                    {stat.context}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Key Takeaways Section */}
      {data.key_takeaways && data.key_takeaways.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Essential Takeaways</span>
          </span>
          <div className="space-y-1.5">
            {data.key_takeaways.map((takeaway, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-surface-panel border border-surface-border flex items-start gap-2 text-xs leading-relaxed opacity-90"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p>{takeaway}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Process / Workflow Steps */}
      {data.process_steps && data.process_steps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60 flex items-center gap-1">
            <GitBranch className="w-3 h-3 text-indigo-400" />
            <span>Operational Flow</span>
          </span>
          <div className="space-y-2">
            {data.process_steps.map((st, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-surface-panel border border-surface-border flex items-start gap-2.5"
              >
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                  {st.step || idx + 1}
                </div>
                <div className="space-y-0.5">
                  <div className="font-medium text-xs opacity-95">
                    {st.title}
                  </div>
                  <p className="text-[11px] opacity-70 leading-relaxed">
                    {st.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Comparison Breakdown */}
      {data.comparison_points && data.comparison_points.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60 flex items-center gap-1">
            <Columns className="w-3 h-3 text-sky-400" />
            <span>Comparative Architecture</span>
          </span>
          <div className="space-y-2">
            {data.comparison_points.map((cp, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-surface-panel border border-surface-border space-y-1.5"
              >
                <span className="text-[10px] font-semibold text-sky-300 uppercase tracking-wider">
                  {cp.feature}
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-surface-base border border-surface-border/50">
                    <span className="opacity-50 text-[9px] block mb-0.5">Focus A</span>
                    <p className="opacity-90">{cp.side_a}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-base border border-surface-border/50">
                    <span className="opacity-50 text-[9px] block mb-0.5">Focus B</span>
                    <p className="opacity-90">{cp.side_b}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
