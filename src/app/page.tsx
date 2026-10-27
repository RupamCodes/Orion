'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { SourceManager } from '../components/SourceManager';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { StudioPanel } from '../components/StudioPanel';
import { SourceViewerModal } from '../components/SourceViewerModal';
import { ModelSettingsModal } from '../components/ModelSettingsModal';
import { INITIAL_SOURCES, INITIAL_NOTES } from '../lib/sample-data';
import { SourceDoc, NoteItem, LocalModelSettings, Citation, Notebook } from '../lib/types';
import { checkOllamaConnection } from '../lib/local-rag';
import { listNotebooks, createNotebook, listSources } from '../lib/api-client';
import { 
  BookOpen, 
  MessageSquare, 
  Sparkles, 
  PanelLeftOpen, 
  PanelRightOpen 
} from 'lucide-react';

type MobileViewTab = 'sources' | 'chat' | 'studio';

export default function OrionHome() {
  const [sources, setSources] = useState<SourceDoc[]>(INITIAL_SOURCES);
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  
  // Notebook Integration State
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState<boolean>(true);
  const [notebookError, setNotebookError] = useState<string | null>(null);

  // Persistent Sources State
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Settings & Status
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<SourceDoc | null>(null);
  const [highlightCitationSnippet, setHighlightCitationSnippet] = useState<string | undefined>();
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);

  // Responsive & Panel Navigation State
  const [activeTab, setActiveTab] = useState<MobileViewTab>('chat');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(false);

  const [settings, setSettings] = useState<LocalModelSettings>({
    provider: 'native_rag',
    ollamaUrl: 'http://localhost:11434',
    selectedModel: 'llama3.2:latest',
    temperature: 0.2,
    topP: 0.9,
    chunkSize: 450,
    chunkOverlap: 80
  });

  // Load Notebooks from Backend on Initial Mount
  const loadNotebooks = async (targetId?: string) => {
    setIsLoadingNotebooks(true);
    setNotebookError(null);
    try {
      let list = await listNotebooks();
      if (list.length === 0) {
        // Automatically create a default notebook if empty
        const defaultNb = await createNotebook({
          title: 'My First Notebook',
          description: 'Default research and study workspace.'
        });
        list = [defaultNb];
      }
      setNotebooks(list);

      // Determine active notebook: targetId -> saved localStorage ID -> first available notebook
      const savedId = targetId || localStorage.getItem('orion-active-notebook-id');
      const matched = list.find(nb => nb.id === savedId) || list[0] || null;
      setActiveNotebook(matched);
      if (matched) {
        localStorage.setItem('orion-active-notebook-id', matched.id);
      }
    } catch (err: any) {
      console.warn('Failed to load notebooks from backend:', err);
      setNotebookError(err.message || 'Unable to connect to backend server.');
    } finally {
      setIsLoadingNotebooks(false);
    }
  };

  useEffect(() => {
    loadNotebooks();
  }, []);

  // Load Persistent Sources when Active Notebook Changes
  useEffect(() => {
    if (!activeNotebook) {
      setSources([]);
      return;
    }

    let isCurrent = true;
    setIsLoadingSources(true);
    setSourceError(null);
    // Clear immediately to prevent stale sources from previous notebook while loading
    setSources([]);

    listSources(activeNotebook.id)
      .then((fetchedSources) => {
        if (isCurrent) {
          setSources(fetchedSources);
        }
      })
      .catch((err: any) => {
        if (isCurrent) {
          console.warn(`Failed to fetch sources for notebook ${activeNotebook.id}:`, err);
          setSourceError(err.message || 'Failed to load sources from database.');
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingSources(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeNotebook?.id]);

  const handleSelectNotebook = (notebook: Notebook) => {
    if (activeNotebook && activeNotebook.id === notebook.id) return;
    setActiveNotebook(notebook);
    localStorage.setItem('orion-active-notebook-id', notebook.id);

    // Isolate workspace state: reset in-memory notes
    setNotes(INITIAL_NOTES);
  };

  const handleCreateNotebook = async (title: string, description?: string): Promise<boolean> => {
    try {
      const created = await createNotebook({ title, description });
      setNotebooks(prev => [created, ...prev]);
      setActiveNotebook(created);
      localStorage.setItem('orion-active-notebook-id', created.id);

      // Reset workspace state for the new notebook
      setSources([]);
      setNotes(INITIAL_NOTES);
      return true;
    } catch (err: any) {
      setNotebookError(err.message || 'Failed to create notebook');
      return false;
    }
  };

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

  // Load saved panel widths and collapse states
  useEffect(() => {
    const savedLeft = localStorage.getItem('orion-left-panel-width');
    const savedRight = localStorage.getItem('orion-right-panel-width');
    const savedLeftCollapsed = localStorage.getItem('orion-left-panel-collapsed');
    const savedRightCollapsed = localStorage.getItem('orion-right-panel-collapsed');
    if (savedLeft) setLeftWidth(Number(savedLeft));
    if (savedRight) setRightWidth(Number(savedRight));
    if (savedLeftCollapsed === 'true') setIsLeftCollapsed(true);
    if (savedRightCollapsed === 'true') setIsRightCollapsed(true);
  }, []);

  const handleToggleLeftCollapse = () => {
    setIsLeftCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('orion-left-panel-collapsed', String(next));
      return next;
    });
  };

  const handleToggleRightCollapse = () => {
    setIsRightCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('orion-right-panel-collapsed', String(next));
      return next;
    });
  };

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
    if (!title?.trim() || !content?.trim()) {
      throw new Error('Note title and content cannot be empty.');
    }
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString().split('T')[0],
      pinnedCitation: citation
    };
    setNotes(prev => [newNote, ...prev]);
    return true;
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] overflow-hidden bg-surface-base text-inherit">
      {/* Header with Integrated Notebook Switcher & Model Status */}
      <Header
        sourcesCount={sources.length}
        selectedSourcesCount={sources.filter(s => s.isSelected).length}
        isOllamaConnected={isOllamaConnected}
        selectedModel={settings.selectedModel}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeNotebook={activeNotebook}
        notebooks={notebooks}
        isLoadingNotebooks={isLoadingNotebooks}
        notebookError={notebookError}
        onSelectNotebook={handleSelectNotebook}
        onCreateNotebook={handleCreateNotebook}
        onRefreshNotebooks={() => loadNotebooks(activeNotebook?.id)}
      />

      {/* Mobile & Tablet Responsive Navigation Bar (< 1024px) */}
      <nav 
        aria-label="Responsive view switcher"
        className="lg:hidden flex items-center justify-center px-3 py-1.5 border-b border-surface-border bg-surface-panel shrink-0 select-none z-30"
      >
        <div className="flex items-center p-0.5 rounded-xl bg-surface-base border border-surface-border w-full max-w-md justify-between">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'sources'
                ? 'bg-surface-panel shadow-xs text-inherit border border-surface-border font-semibold'
                : 'opacity-65 hover:opacity-100 text-inherit border border-transparent'
            }`}
            aria-selected={activeTab === 'sources'}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Sources</span>
            {sources.length > 0 && (
              <span className="text-[10px] opacity-60 font-mono">({sources.length})</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'chat'
                ? 'bg-surface-panel shadow-xs text-inherit border border-surface-border font-semibold'
                : 'opacity-65 hover:opacity-100 text-inherit border border-transparent'
            }`}
            aria-selected={activeTab === 'chat'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'studio'
                ? 'bg-surface-panel shadow-xs text-inherit border border-surface-border font-semibold text-indigo-400'
                : 'opacity-65 hover:opacity-100 text-inherit border border-transparent'
            }`}
            aria-selected={activeTab === 'studio'}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Studio</span>
          </button>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className={`flex-1 min-h-0 min-w-0 flex flex-row overflow-hidden relative ${
        isDraggingLeft || isDraggingRight ? 'select-none' : ''
      }`}>
        {/* Transparent Drag Overlay */}
        {(isDraggingLeft || isDraggingRight) && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

        {/* Collapsed Left Panel Reopen Strip (Desktop Only) */}
        {isLeftCollapsed && (
          <div className="hidden lg:flex flex-col items-center py-2.5 px-1 bg-surface-panel border-r border-surface-border shrink-0 select-none z-20">
            <button
              onClick={handleToggleLeftCollapse}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
              title="Expand Sources sidebar"
              aria-label="Expand Sources sidebar"
            >
              <PanelLeftOpen className="w-4 h-4 text-indigo-400" />
            </button>
            <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 mt-4 select-none">
              Sources ({sources.length})
            </span>
          </div>
        )}

        {/* Left: Source Drawer with Persistent SQLite Support */}
        <div
          className={`h-full overflow-hidden flex-shrink-0 ${
            activeTab === 'sources' ? 'w-full flex' : 'hidden'
          } ${isLeftCollapsed ? 'lg:hidden' : 'lg:flex'}`}
        >
          <div
            style={{ width: `${leftWidth}px` }}
            className="w-full lg:w-auto h-full overflow-hidden"
          >
            <SourceManager
              sources={sources}
              onUpdateSources={setSources}
              onViewSource={(s) => handleOpenSourceModal(s)}
              activeNotebookId={activeNotebook?.id || null}
              isLoadingSources={isLoadingSources}
              sourceError={sourceError}
              onRetryLoad={() => {
                if (activeNotebook) {
                  setIsLoadingSources(true);
                  listSources(activeNotebook.id)
                    .then(setSources)
                    .catch(err => setSourceError(err.message))
                    .finally(() => setIsLoadingSources(false));
                }
              }}
              onToggleCollapse={handleToggleLeftCollapse}
            />
          </div>
        </div>

        {/* Left Resizer Boundary (Desktop Only) */}
        <div
          onMouseDown={() => setIsDraggingLeft(true)}
          className={`hidden ${
            isLeftCollapsed ? 'lg:hidden' : 'lg:block'
          } w-px bg-surface-border h-full relative flex-shrink-0 z-20 cursor-col-resize group`}
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5 w-4 cursor-col-resize hover:bg-white/20 active:bg-white/40 transition-colors" />
        </div>

        {/* Center: RAG Chat */}
        <div
          className={`h-full min-h-0 min-w-0 overflow-hidden ${
            activeTab === 'chat' ? 'w-full flex flex-col' : 'hidden'
          } lg:flex lg:flex-col lg:flex-1`}
        >
          <ChatWorkspace
            sources={sources}
            onOpenSourceModal={handleOpenSourceModal}
            onSaveToNotes={handleSaveToNotes}
            ollamaUrl={settings.ollamaUrl}
            selectedModel={settings.selectedModel}
            activeNotebookId={activeNotebook?.id || null}
          />
        </div>

        {/* Right Resizer Boundary (Desktop Only) */}
        <div
          onMouseDown={() => setIsDraggingRight(true)}
          className={`hidden ${
            isRightCollapsed ? 'lg:hidden' : 'lg:block'
          } w-px bg-surface-border h-full relative flex-shrink-0 z-20 cursor-col-resize group`}
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5 w-4 cursor-col-resize hover:bg-white/20 active:bg-white/40 transition-colors" />
        </div>

        {/* Right: Studio & Audio Discussion */}
        <div
          className={`h-full overflow-hidden flex-shrink-0 ${
            activeTab === 'studio' ? 'w-full flex' : 'hidden'
          } ${isRightCollapsed ? 'lg:hidden' : 'lg:flex'}`}
        >
          <div
            style={{ width: `${rightWidth}px` }}
            className="w-full lg:w-auto h-full overflow-hidden"
          >
            <StudioPanel
              sources={sources}
              onOpenSourceModal={handleOpenSourceModal}
              activeNotebookId={activeNotebook?.id || null}
              selectedModel={settings.selectedModel}
              onToggleCollapse={handleToggleRightCollapse}
            />
          </div>
        </div>

        {/* Collapsed Right Panel Reopen Strip (Desktop Only) */}
        {isRightCollapsed && (
          <div className="hidden lg:flex flex-col items-center py-2.5 px-1 bg-surface-panel border-l border-surface-border shrink-0 select-none z-20">
            <button
              onClick={handleToggleRightCollapse}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
              title="Expand Studio panel"
              aria-label="Expand Studio panel"
            >
              <PanelRightOpen className="w-4 h-4 text-indigo-400" />
            </button>
            <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest [writing-mode:vertical-rl] mt-4 select-none">
              Studio Forge
            </span>
          </div>
        )}
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
