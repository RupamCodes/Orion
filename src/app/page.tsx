'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { SourceManager } from '../components/SourceManager';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { StudioPanel } from '../components/StudioPanel';
import { SourceViewerModal } from '../components/SourceViewerModal';
import { ModelSettingsModal } from '../components/ModelSettingsModal';
import { INITIAL_SOURCES, INITIAL_STUDIO_ARTIFACTS, INITIAL_NOTES } from '../lib/sample-data';
import { SourceDoc, NoteItem, LocalModelSettings, Citation, StudioArtifact } from '../lib/types';
import { checkOllamaConnection } from '../lib/local-rag';

export default function OrionHome() {
  const [sources, setSources] = useState<SourceDoc[]>(INITIAL_SOURCES);
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>(INITIAL_STUDIO_ARTIFACTS);
  
  // Settings & Status
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<SourceDoc | null>(null);
  const [highlightCitationSnippet, setHighlightCitationSnippet] = useState<string | undefined>();
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);

  const [settings, setSettings] = useState<LocalModelSettings>({
    provider: 'native_rag',
    ollamaUrl: 'http://localhost:11434',
    selectedModel: 'llama3.2:latest',
    temperature: 0.2,
    topP: 0.9,
    chunkSize: 450,
    chunkOverlap: 80
  });

  useEffect(() => {
    checkOllamaConnection(settings.ollamaUrl).then(res => {
      setIsOllamaConnected(res.isAvailable);
      if (res.isAvailable && res.models.length > 0) {
        setSettings(prev => ({ ...prev, selectedModel: res.models[0] }));
      }
    });
  }, [settings.ollamaUrl]);

  // Resizable Panel Widths (in px)
  const [leftWidth, setLeftWidth] = useState<number>(300);
  const [rightWidth, setRightWidth] = useState<number>(380);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Load saved panel widths
  useEffect(() => {
    const savedLeft = localStorage.getItem('orion-left-panel-width');
    const savedRight = localStorage.getItem('orion-right-panel-width');
    if (savedLeft) setLeftWidth(Number(savedLeft));
    if (savedRight) setRightWidth(Number(savedRight));
  }, []);

  // Handle Dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newLeft = Math.min(Math.max(e.clientX, 200), Math.min(600, window.innerWidth * 0.45));
        setLeftWidth(newLeft);
        localStorage.setItem('orion-left-panel-width', String(newLeft));
      } else if (isDraggingRight) {
        const newRight = Math.min(Math.max(window.innerWidth - e.clientX, 250), Math.min(700, window.innerWidth * 0.5));
        setRightWidth(newRight);
        localStorage.setItem('orion-right-panel-width', String(newRight));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  const handleOpenSourceModal = (source: SourceDoc, highlightText?: string) => {
    setViewingSource(source);
    setHighlightCitationSnippet(highlightText);
  };

  const handleSaveToNotes = (title: string, content: string, citation?: Citation) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title,
      content,
      createdAt: new Date().toISOString().split('T')[0],
      pinnedCitation: citation
    };
    setNotes(prev => [newNote, ...prev]);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-base text-zinc-100 selection:bg-white/20 selection:text-white">
      {/* Minimal Header */}
      <Header
        sourcesCount={sources.length}
        selectedSourcesCount={sources.filter(s => s.isSelected).length}
        isOllamaConnected={isOllamaConnected}
        selectedModel={settings.selectedModel}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace */}
      <main className={`flex-1 flex flex-col md:flex-row h-full overflow-hidden relative ${
        isDraggingLeft || isDraggingRight ? 'select-none' : ''
      }`}>
        {/* Transparent Drag Overlay */}
        {(isDraggingLeft || isDraggingRight) && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

        {/* Left: Source Drawer */}
        <div
          style={{ width: `${leftWidth}px` }}
          className="w-full md:w-auto flex-shrink-0 h-full overflow-hidden"
        >
          <SourceManager
            sources={sources}
            onUpdateSources={setSources}
            onViewSource={(s) => handleOpenSourceModal(s)}
          />
        </div>

        {/* Left Resizer Boundary */}
        <div
          onMouseDown={() => setIsDraggingLeft(true)}
          className="hidden md:block w-px bg-surface-border h-full relative flex-shrink-0 z-20 cursor-col-resize group"
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5 w-4 cursor-col-resize hover:bg-white/20 active:bg-white/40 transition-colors" />
        </div>

        {/* Center: RAG Chat */}
        <div className="flex-1 min-w-[280px] h-full overflow-hidden">
          <ChatWorkspace
            sources={sources}
            onOpenSourceModal={handleOpenSourceModal}
            onSaveToNotes={handleSaveToNotes}
            ollamaUrl={settings.ollamaUrl}
            selectedModel={settings.selectedModel}
          />
        </div>

        {/* Right Resizer Boundary */}
        <div
          onMouseDown={() => setIsDraggingRight(true)}
          className="hidden lg:block w-px bg-surface-border h-full relative flex-shrink-0 z-20 cursor-col-resize group"
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5 w-4 cursor-col-resize hover:bg-white/20 active:bg-white/40 transition-colors" />
        </div>

        {/* Right: Studio & Audio Discussion */}
        <div
          style={{ width: `${rightWidth}px` }}
          className="hidden lg:block flex-shrink-0 h-full overflow-hidden"
        >
          <StudioPanel
            sources={sources}
            artifacts={artifacts}
            notes={notes}
            onUpdateNotes={setNotes}
            onOpenSourceModal={handleOpenSourceModal}
          />
        </div>
      </main>

      {/* Document View Modal */}
      <SourceViewerModal
        source={viewingSource}
        highlightText={highlightCitationSnippet}
        onClose={() => {
          setViewingSource(null);
          setHighlightCitationSnippet(undefined);
        }}
      />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <ModelSettingsModal
          settings={settings}
          onUpdateSettings={(newSettings) => {
            setSettings(newSettings);
            checkOllamaConnection(newSettings.ollamaUrl).then(res => setIsOllamaConnected(res.isAvailable));
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
