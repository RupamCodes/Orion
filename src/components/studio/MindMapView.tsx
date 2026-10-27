'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { StudioArtifact, SourceDoc, MindMapNode, MindMapEdge } from '../../lib/types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Share2, 
  ExternalLink, 
  Layers, 
  Download,
  Check,
  RotateCw
} from 'lucide-react';
import { NotificationBanner, NotificationState } from '../NotificationBanner';

interface MindMapViewProps {
  artifact: StudioArtifact;
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
}

export const MindMapView: React.FC<MindMapViewProps> = ({
  artifact,
  sources,
  onOpenSourceModal,
}) => {
  const content = artifact.structured_content || {};
  const rawNodes: MindMapNode[] = content.nodes || [];
  const rawEdges: MindMapEdge[] = content.edges || [];
  const rootId: string = content.root_id || (rawNodes[0]?.id || 'node-root');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(rootId);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [notice, setNotice] = useState<NotificationState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss transient notices
  useEffect(() => {
    if (!notice) return;
    if (notice.type === 'success' || notice.type === 'info') {
      const timer = setTimeout(() => setNotice(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Compute clean layout coordinates for nodes
  const layout = useMemo(() => {
    if (!rawNodes || rawNodes.length === 0) return { nodes: [], edges: [] };

    const width = 600;
    const height = 440;
    const centerX = width / 2;
    const centerY = height / 2;

    const root = rawNodes.find(n => n.id === rootId) || rawNodes[0];
    const childNodes = rawNodes.filter(n => n.id !== root.id);

    const positionedNodes: (MindMapNode & { x: number; y: number; isRoot: boolean })[] = [
      { ...root, x: centerX, y: centerY, isRoot: true }
    ];

    const childCount = childNodes.length;
    const radiusX = Math.min(230, Math.max(160, width * 0.36));
    const radiusY = Math.min(170, Math.max(120, height * 0.32));

    childNodes.forEach((node, idx) => {
      // Evenly distribute in an elliptical orbit around root
      const angle = (2 * Math.PI * idx) / childCount - Math.PI / 2;
      const x = centerX + radiusX * Math.cos(angle);
      const y = centerY + radiusY * Math.sin(angle);
      positionedNodes.push({
        ...node,
        x,
        y,
        isRoot: false
      });
    });

    const nodeCoordMap = new Map<string, { x: number; y: number }>();
    positionedNodes.forEach(n => nodeCoordMap.set(n.id, { x: n.x, y: n.y }));

    const positionedEdges = rawEdges.map(e => {
      const fromCoord = nodeCoordMap.get(e.from) || { x: centerX, y: centerY };
      const toCoord = nodeCoordMap.get(e.to) || { x: centerX, y: centerY };
      return {
        ...e,
        fromX: fromCoord.x,
        fromY: fromCoord.y,
        toX: toCoord.x,
        toY: toCoord.y,
        midX: (fromCoord.x + toCoord.x) / 2,
        midY: (fromCoord.y + toCoord.y) / 2
      };
    });

    return { nodes: positionedNodes, edges: positionedEdges };
  }, [rawNodes, rawEdges, rootId]);

  const selectedNode = layout.nodes.find(n => n.id === selectedNodeId) || layout.nodes[0];

  // Sensible limits on zoom and pan so map is never lost off-screen
  const clampZoom = (z: number) => {
    return Math.min(2.5, Math.max(0.5, Number(z.toFixed(2))));
  };

  const clampPan = (x: number, y: number, currentZoom: number) => {
    const maxX = 300 * Math.max(1, currentZoom);
    const maxY = 220 * Math.max(1, currentZoom);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const mouseStateRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    hasMoved: false,
  });

  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    startDist: number;
    startZoom: number;
    hasMoved: boolean;
    isPinching: boolean;
  }>({
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    startDist: 0,
    startZoom: 1,
    hasMoved: false,
    isPinching: false,
  });

  // Desktop Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'svg' || target.id === 'map-canvas' || target.id === 'canvas-bg') {
      setIsPanning(true);
      mouseStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        hasMoved: false,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - mouseStateRef.current.startX;
      const dy = e.clientY - mouseStateRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        mouseStateRef.current.hasMoved = true;
      }
      const nextPan = clampPan(
        mouseStateRef.current.startPanX + dx,
        mouseStateRef.current.startPanY + dy,
        zoom
      );
      setPan(nextPan);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Mobile Touch Handlers: 1-finger pan & 2-finger pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        startDist: 0,
        startZoom: zoom,
        hasMoved: false,
        isPinching: false,
      };
      setIsPanning(true);
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStateRef.current = {
        startX: (t1.clientX + t2.clientX) / 2,
        startY: (t1.clientY + t2.clientY) / 2,
        startPanX: pan.x,
        startPanY: pan.y,
        startDist: dist,
        startZoom: zoom,
        hasMoved: true,
        isPinching: true,
      };
      setIsPanning(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPanning) return;

    if (e.touches.length === 1 && !touchStateRef.current.isPinching) {
      const t = e.touches[0];
      const dx = t.clientX - touchStateRef.current.startX;
      const dy = t.clientY - touchStateRef.current.startY;
      if (Math.hypot(dx, dy) > 5) {
        touchStateRef.current.hasMoved = true;
      }
      if (touchStateRef.current.hasMoved) {
        const nextPan = clampPan(
          touchStateRef.current.startPanX + dx,
          touchStateRef.current.startPanY + dy,
          zoom
        );
        setPan(nextPan);
      }
    } else if (e.touches.length === 2 && touchStateRef.current.startDist > 0) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = dist / touchStateRef.current.startDist;
      const newZoom = clampZoom(touchStateRef.current.startZoom * scale);
      setZoom(newZoom);
      touchStateRef.current.hasMoved = true;
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    touchStateRef.current.isPinching = false;
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(rootId);
  };

  const handleOpenSource = (node: MindMapNode) => {
    const targetSource = sources.find(s => s.id === node.source_id) || sources[0];
    if (targetSource) {
      onOpenSourceModal(targetSource, node.snippet || node.description);
    }
  };

  // Helper to escape XML/SVG characters
  const escapeXml = (str: string = ''): string => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper to export Mind Map as valid standalone SVG
  const handleExportSVG = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const title = artifact.title || 'Mind_Map';

      const edgeSvg = layout.edges.map(e => `
        <line x1="${e.fromX}" y1="${e.fromY}" x2="${e.toX}" y2="${e.toY}" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>
        ${e.label ? `<text x="${e.midX}" y="${e.midY - 4}" fill="#a1a1aa" font-size="9" font-family="system-ui, sans-serif" text-anchor="middle">${escapeXml(e.label)}</text>` : ''}
      `).join('');

      const nodeSvg = layout.nodes.map(node => {
        const isRoot = node.isRoot;
        const rectW = isRoot ? 150 : 120;
        const rectH = isRoot ? 44 : 36;
        const rx = isRoot ? 22 : 18;
        const fill = isRoot ? '#4f46e5' : '#18181b';
        const stroke = isRoot ? '#818cf8' : '#3f3f46';
        const textColor = '#ffffff';

        return `
          <g transform="translate(${node.x}, ${node.y})">
            <rect x="${-rectW / 2}" y="${-rectH / 2}" width="${rectW}" height="${rectH}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
            <text y="4" text-anchor="middle" fill="${textColor}" font-size="11" font-weight="${isRoot ? 'bold' : 'normal'}" font-family="system-ui, sans-serif">
              ${escapeXml(node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label)}
            </text>
          </g>
        `;
      }).join('');

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 440" width="600" height="440" style="background:#09090b;">
  <rect width="600" height="440" fill="#09090b"/>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#6366f1"/>
    </marker>
  </defs>
  <text x="24" y="32" fill="#818cf8" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">ORION MIND MAP · ${escapeXml(title)}</text>
  <g>
    ${edgeSvg}
    ${nodeSvg}
  </g>
</svg>`.trim();

      // Validate SVG with DOMParser
      if (typeof window !== 'undefined' && window.DOMParser) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const parseErr = doc.querySelector('parsererror');
        if (parseErr) {
          throw new Error(`Invalid SVG generated: ${parseErr.textContent?.slice(0, 100) || 'Syntax error'}`);
        }
      }

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_mind_map.svg`;
      link.click();
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
      setNotice({
        type: 'success',
        message: 'Mind map exported as SVG successfully.',
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err?.message || 'Failed to export Mind Map SVG.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3 select-none flex flex-col h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between text-xs pb-1 border-b border-surface-border">
        <div className="flex items-center gap-1.5 opacity-80">
          <Share2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold truncate max-w-[170px] sm:max-w-[200px]">
            {artifact.title}
          </span>
        </div>

        {/* Right: Export SVG and Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportSVG}
            disabled={isExporting}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs font-medium transition-colors opacity-80 hover:opacity-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Download vector SVG layout"
            aria-label="Export Mind Map as SVG"
          >
            {exportSuccess ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] text-emerald-400">Exported</span>
              </>
            ) : isExporting ? (
              <>
                <RotateCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span className="text-[11px]">Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                <span className="text-[11px]">Export SVG</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-0.5 bg-surface-panel p-0.5 rounded-lg border border-surface-border">
            <button
              type="button"
              onClick={() => setZoom(prev => clampZoom(prev + 0.15))}
              className="p-1 hover:bg-surface-hover rounded text-xs opacity-75 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              title="Zoom In"
              aria-label="Zoom in mind map"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 font-mono text-[10px] opacity-65 min-w-[32px] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(prev => clampZoom(prev - 0.15))}
              className="p-1 hover:bg-surface-hover rounded text-xs opacity-75 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              title="Zoom Out"
              aria-label="Zoom out mind map"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="p-1 hover:bg-surface-hover rounded text-xs opacity-75 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              title="Reset Canvas View"
              aria-label="Reset mind map canvas view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
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

      {/* Interactive Canvas Viewport */}
      <div
        ref={containerRef}
        id="map-canvas"
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full h-[280px] bg-surface-panel rounded-2xl border border-surface-border overflow-hidden cursor-${isPanning ? 'grabbing' : 'grab'}`}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 600 440"
          className="w-full h-full pointer-events-auto"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="16"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" className="text-zinc-500" />
            </marker>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#6366f1" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Background capture for drag panning */}
          <rect id="canvas-bg" width="600" height="440" fill="transparent" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {layout.edges.map((e, idx) => {
              const isConnected = selectedNodeId === e.from || selectedNodeId === e.to;
              return (
                <g key={`edge-${idx}`}>
                  <line
                    x1={e.fromX}
                    y1={e.fromY}
                    x2={e.toX}
                    y2={e.toY}
                    stroke="currentColor"
                    className={`transition-colors duration-200 ${
                      isConnected ? 'text-indigo-500 dark:text-indigo-400 stroke-[2]' : 'text-zinc-400 dark:text-zinc-600/50 stroke-[1.2]'
                    }`}
                    markerEnd="url(#arrow)"
                  />
                  {e.label && (
                    <text
                      x={e.midX}
                      y={e.midY - 4}
                      fill="currentColor"
                      className="text-[9px] font-mono fill-zinc-600 dark:fill-zinc-400 select-none opacity-80 text-anchor-middle"
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isRoot = node.isRoot;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!mouseStateRef.current.hasMoved && !touchStateRef.current.hasMoved) {
                      setSelectedNodeId(node.id);
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (!touchStateRef.current.hasMoved) {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                    }
                  }}
                  className="cursor-pointer group"
                >
                  {/* Node Capsule */}
                  <rect
                    x={isRoot ? -75 : -60}
                    y={isRoot ? -22 : -18}
                    width={isRoot ? 150 : 120}
                    height={isRoot ? 44 : 36}
                    rx={isRoot ? 22 : 18}
                    className={`transition-all duration-200 ${
                      isRoot
                        ? isSelected
                          ? 'fill-indigo-600 stroke-indigo-300 stroke-2'
                          : 'fill-indigo-600 dark:fill-indigo-900/90 stroke-indigo-400 dark:stroke-indigo-500/80 stroke-1.5'
                        : isSelected
                        ? 'fill-indigo-50 dark:fill-surface-hover stroke-indigo-500 dark:stroke-indigo-400 stroke-2'
                        : 'fill-surface-base stroke-surface-border group-hover:stroke-surface-borderHover stroke-1'
                    }`}
                    filter={isSelected ? 'url(#glow)' : undefined}
                  />

                  {/* Label Text */}
                  <text
                    y={isRoot ? 4 : 3}
                    textAnchor="middle"
                    className={`text-[11px] font-medium select-none pointer-events-none ${
                      isRoot
                        ? 'fill-white font-semibold'
                        : isSelected
                        ? 'fill-indigo-700 dark:fill-indigo-200 font-semibold'
                        : 'fill-zinc-800 dark:fill-zinc-200'
                    }`}
                  >
                    {node.label.length > (isRoot ? 20 : 15)
                      ? node.label.slice(0, isRoot ? 18 : 13) + '...'
                      : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Canvas Helper Pill */}
        <div className="absolute bottom-2 left-2 text-[10px] px-2.5 py-1 rounded-full bg-surface-base/85 border border-surface-border/70 backdrop-blur opacity-75 font-sans">
          Drag / Touch to pan · Pinch to zoom · Tap node to inspect
        </div>
      </div>

      {/* Selected Node Evidence Inspector Drawer */}
      {selectedNode && (
        <div className="p-3.5 rounded-xl bg-surface-panel border border-surface-border space-y-2 animate-fade-in text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-xs opacity-95">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>{selectedNode.label}</span>
            </div>
            {selectedNode.category && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-base border border-surface-border opacity-70">
                {selectedNode.category}
              </span>
            )}
          </div>

          <p className="text-[11px] leading-relaxed opacity-80">
            {selectedNode.description}
          </p>

          {selectedNode.snippet && (
            <div className="p-2 rounded-lg bg-surface-base border border-surface-border/50 text-[11px] space-y-1">
              <div className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center justify-between">
                <span>Source Grounding</span>
                {selectedNode.source_title && (
                  <span className="opacity-70 font-mono normal-case">{selectedNode.source_title}</span>
                )}
              </div>
              <p className="italic opacity-70 line-clamp-2">
                "{selectedNode.snippet}"
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-[11px]">
            <span className="opacity-50 text-[10px]">
              {selectedNode.isRoot ? 'Central Root Concept' : 'Child Concept Node'}
            </span>
            <button
              type="button"
              onClick={() => handleOpenSource(selectedNode)}
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              <span>View in Source Document</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
