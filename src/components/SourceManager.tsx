'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SourceDoc, SourceType } from '../lib/types';
import { createSource, deleteSource as apiDeleteSource, updateSource as apiUpdateSource } from '../lib/api-client';
import Tesseract from 'tesseract.js';
import { 
  Trash2, 
  Eye, 
  CheckSquare, 
  Square, 
  Plus, 
  Upload, 
  Link, 
  Youtube, 
  BookOpen, 
  Copy as CopyIcon, 
  PenTool, 
  X, 
  AlertCircle,
  AlertTriangle,
  RotateCw,
  PanelLeftClose
} from 'lucide-react';
import { NotificationBanner } from './NotificationBanner';

interface SourceManagerProps {
  sources: SourceDoc[];
  onUpdateSources: (sources: SourceDoc[]) => void;
  onViewSource: (source: SourceDoc) => void;
  activeNotebookId: string | null;
  isLoadingSources?: boolean;
  sourceError?: string | null;
  onRetryLoad?: () => void;
  onToggleCollapse?: () => void;
}

export const SourceManager: React.FC<SourceManagerProps> = ({
  sources,
  onUpdateSources,
  onViewSource,
  activeNotebookId,
  isLoadingSources = false,
  sourceError = null,
  onRetryLoad,
  onToggleCollapse
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'text' | 'link' | 'youtube' | null>(null);
  const [rawTitle, setRawTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset deletion confirmations on notebook change or when target source removed
  useEffect(() => {
    setConfirmDeleteId(null);
    setDeletingId(null);
  }, [activeNotebookId]);

  useEffect(() => {
    if (confirmDeleteId && !sources.some(s => s.id === confirmDeleteId)) {
      setConfirmDeleteId(null);
    }
  }, [sources, confirmDeleteId]);

  // Keyboard shortcut: Escape cancels source deletion confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmDeleteId) {
        setConfirmDeleteId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeleteId]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
        setActiveInput(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSelectAll = async () => {
    const allSelected = sources.every((s) => s.isSelected);
    const newSelected = !allSelected;
    onUpdateSources(sources.map((s) => ({ ...s, isSelected: newSelected })));

    if (activeNotebookId) {
      // Persist selection updates
      for (const source of sources) {
        if (source.isSelected !== newSelected) {
          apiUpdateSource(activeNotebookId, source.id, { is_selected: newSelected }).catch((err) =>
            console.warn(`Failed to update selection for source ${source.id}:`, err)
          );
        }
      }
    }
  };

  const toggleSourceSelection = async (id: string) => {
    const target = sources.find((s) => s.id === id);
    if (!target) return;
    const newSelected = !target.isSelected;

    // Optimistic UI update
    onUpdateSources(
      sources.map((s) => (s.id === id ? { ...s, isSelected: newSelected } : s))
    );

    if (activeNotebookId) {
      try {
        await apiUpdateSource(activeNotebookId, id, { is_selected: newSelected });
      } catch (err: any) {
        console.warn('Failed to persist selection state:', err);
      }
    }
  };

  const executeDeleteSource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeNotebookId || deletingId === id) return;

    setDeletingId(id);
    setLocalError(null);
    try {
      await apiDeleteSource(activeNotebookId, id);
      onUpdateSources(sources.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } catch (err: any) {
      console.error('Failed to delete source from backend:', err);
      setLocalError(err.message || 'Failed to delete source.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!activeNotebookId) {
      setLocalError('Please create or select a notebook before adding documents.');
      return;
    }

    setIsUploading(true);
    setIsPopoverOpen(false);
    setLocalError(null);
    const newSourcesList: SourceDoc[] = [];

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      let type: SourceType = 'txt';
      let extractedText = '';

      if (fileExt === 'pdf') {
        type = 'pdf';
        try {
          const { extractTextFromPdf } = await import('../lib/pdf-parser');
          const res = await extractTextFromPdf(file);
          extractedText = res.text;
        } catch (err) {
          console.error('PDF parsing error:', err);
          extractedText = await file.text();
        }
      } else if (fileExt === 'md' || fileExt === 'markdown') {
        type = 'md';
        extractedText = await file.text();
      } else if (['png', 'jpg', 'jpeg'].includes(fileExt || '')) {
        type = 'image_ocr';
        try {
          const result = await Tesseract.recognize(file, 'eng');
          extractedText = result.data.text;
        } catch (err) {
          console.error('OCR Error:', err);
          continue;
        }
      } else {
        type = 'txt';
        extractedText = await file.text();
      }

      if (!extractedText.trim()) continue;

      try {
        // Persist directly to SQLite via notebook API
        const savedSource = await createSource(activeNotebookId, {
          title: file.name,
          content: extractedText.trim(),
          source_type: type,
          summary: extractedText.slice(0, 160).replace(/\n+/g, ' ') + '...',
          metadata: {
            filename: file.name,
            file_extension: fileExt,
            topics: [fileExt?.toUpperCase() || 'Document'],
          },
        });
        newSourcesList.push(savedSource);
      } catch (saveErr: any) {
        console.error('Failed to persist source to backend:', saveErr);
        setLocalError(
          `Failed to save "${file.name}": ${saveErr.message || 'Backend error'}`
        );
      }
    }

    if (newSourcesList.length > 0) {
      onUpdateSources([...newSourcesList, ...sources]);
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddManualSource = async () => {
    if (!activeInput || !activeNotebookId) {
      if (!activeNotebookId) {
        setLocalError('Please create or select a notebook before adding sources.');
      }
      return;
    }

    setLocalError(null);
    let newSourcesList: SourceDoc[] = [];

    if (activeInput === 'text') {
      if (!rawContent.trim()) return;

      try {
        const saved = await createSource(activeNotebookId, {
          title: rawTitle.trim() || `Source ${sources.length + 1}`,
          content: rawContent.trim(),
          source_type: 'note',
          summary: rawContent.slice(0, 150) + '...',
          metadata: { topics: ['Manual Entry'] },
        });
        newSourcesList.push(saved);
      } catch (err: any) {
        setLocalError(`Failed to save manual note: ${err.message || 'Server error'}`);
        return;
      }
    } else if (activeInput === 'link' || activeInput === 'youtube') {
      const urls = rawContent
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      if (urls.length === 0) return;

      for (let index = 0; index < urls.length; index++) {
        const url = urls[index];
        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
        const mockContent = `[Placeholder Note] This is mock extracted content from ${url}. Genuine live web scraping and YouTube transcript extraction will be implemented in a future phase.`;

        let extractedTitle = url;
        try {
          const parsedUrl = new URL(url);
          extractedTitle = parsedUrl.hostname.replace('www.', '') + parsedUrl.pathname;
        } catch {
          // keep original
        }

        try {
          const saved = await createSource(activeNotebookId, {
            title: `[Placeholder] ${extractedTitle.slice(0, 40)}`,
            content: mockContent,
            source_type: isYoutube ? 'youtube' : 'url',
            summary: mockContent.slice(0, 100) + '...',
            metadata: {
              url,
              is_placeholder: true,
              topics: [isYoutube ? 'Video' : 'Website'],
            },
          });
          newSourcesList.push(saved);
        } catch (err: any) {
          setLocalError(`Failed to save link: ${err.message || 'Server error'}`);
        }
      }
    }

    if (newSourcesList.length > 0) {
      onUpdateSources([...newSourcesList, ...sources]);
    }

    setRawTitle('');
    setRawContent('');
    setActiveInput(null);
    setIsPopoverOpen(false);
  };

  return (
    <div className="h-full flex flex-col bg-surface-panel select-none relative">
      {/* Sidebar Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-inherit opacity-90">
              Sources
            </span>
            {sources.length > 0 && (
              <span className="text-[11px] font-mono opacity-50">
                ({sources.length})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {sources.length > 1 && (
              <button
                onClick={toggleSelectAll}
                className="text-xs text-inherit opacity-60 hover:opacity-100 transition-colors"
              >
                {sources.every((s) => s.isSelected) ? 'Deselect all' : 'Select all'}
              </button>
            )}

            <button
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              disabled={isUploading || !activeNotebookId}
              title={
                !activeNotebookId
                  ? 'Select a notebook first'
                  : 'Add documents or notes'
              }
              className="p-1.5 rounded-full bg-surface-hover border border-surface-border hover:border-surface-borderHover transition-all text-inherit disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-surface-hover text-inherit opacity-60 hover:opacity-100 transition-colors"
                title="Collapse Sources panel"
                aria-label="Collapse Sources panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Error Notice Banner */}
        {(localError || sourceError) && (
          <NotificationBanner
            type="error"
            message={localError || sourceError || ''}
            onDismiss={localError ? () => setLocalError(null) : undefined}
            action={!localError && onRetryLoad ? { label: 'Retry', onClick: onRetryLoad } : undefined}
          />
        )}
      </div>

      {/* Add Sources Popover */}
      {isPopoverOpen && (
        <div
          ref={popoverRef}
          className="absolute top-14 left-4 right-4 z-50 bg-surface-panel border border-surface-borderHover shadow-xl rounded-xl p-2 animate-fade-in flex flex-col"
        >
          {!activeInput ? (
            <div className="grid grid-cols-2 gap-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                accept=".pdf,.txt,.md,.markdown,.json,.csv,image/png,image/jpeg,image/jpg"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left"
              >
                <Upload className="w-4 h-4" /> Upload files
              </button>
              <button
                onClick={() => setActiveInput('youtube')}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left"
              >
                <Youtube className="w-4 h-4" /> YouTube
              </button>
              <button
                onClick={() => setActiveInput('link')}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left"
              >
                <Link className="w-4 h-4" /> Websites
              </button>
              <button
                disabled
                className="flex items-center gap-2 p-2 rounded-lg text-sm text-inherit opacity-40 cursor-not-allowed text-left"
                title="Play Books integration is not yet supported"
              >
                <BookOpen className="w-4 h-4" /> Play Books
              </button>
              <button
                onClick={() => setActiveInput('text')}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left"
              >
                <CopyIcon className="w-4 h-4" /> Copied text
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left"
              >
                <PenTool className="w-4 h-4" /> Handwritten
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold capitalize opacity-80">
                  Add {activeInput}
                </span>
                <button
                  onClick={() => setActiveInput(null)}
                  className="p-1 rounded hover:bg-surface-hover opacity-60 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {(activeInput === 'link' || activeInput === 'youtube') && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] flex items-start gap-1.5 leading-tight">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Live extraction for {activeInput === 'youtube' ? 'YouTube transcripts' : 'websites'} is not implemented yet. Submitted URLs will be saved as placeholder notes.
                  </span>
                </div>
              )}

              {activeInput === 'text' && (
                <input
                  type="text"
                  placeholder="Title (optional)..."
                  value={rawTitle}
                  onChange={(e) => setRawTitle(e.target.value)}
                  className="w-full bg-surface-base border border-surface-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-surface-borderHover"
                />
              )}

              <textarea
                placeholder={
                  activeInput === 'text'
                    ? 'Paste text here...'
                    : 'Paste URLs separated by newlines or commas...'
                }
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                rows={4}
                className="w-full bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-surface-borderHover resize-none"
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={handleAddManualSource}
                  disabled={!rawContent.trim() || !activeNotebookId}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-all w-full"
                >
                  Save to Notebook
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sources List or Empty/Loading State */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
        {isUploading && (
          <div className="p-3 rounded-xl border border-surface-border bg-surface-hover animate-pulse text-xs text-center opacity-70">
            Processing and persisting document to database...
          </div>
        )}

        {isLoadingSources && (
          <div className="p-6 text-center text-xs opacity-50 flex flex-col items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-foreground-base animate-pulse" />
            <span>Loading notebook sources...</span>
          </div>
        )}

        {!isLoadingSources && sources.length === 0 && !isUploading ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-50">
            <div className="text-sm font-medium mb-1">No sources</div>
            <p className="text-xs leading-relaxed max-w-[200px]">
              Click + to upload documents, Markdown, or text into this notebook.
            </p>
          </div>
        ) : (
          !isLoadingSources &&
          sources.map((source) => (
            <div
              key={source.id}
              onClick={() => toggleSourceSelection(source.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer group flex items-center justify-between ${
                source.isSelected
                  ? 'bg-surface-hover border-surface-borderHover'
                  : 'bg-surface-panel border-surface-border opacity-70 hover:opacity-100 hover:bg-surface-base'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                <div
                  className="opacity-70 group-hover:opacity-100 shrink-0 p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSourceSelection(source.id);
                  }}
                  aria-label={source.isSelected ? `Deselect ${source.title}` : `Select ${source.title}`}
                  role="checkbox"
                  aria-checked={source.isSelected}
                >
                  {source.isSelected ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium truncate text-inherit">
                    {source.title}
                  </span>
                  <span className="text-[10px] opacity-60 truncate">
                    {source.type.toUpperCase()} • {source.wordCount} words
                    {source.chunks?.length ? ` • ${source.chunks.length} chunks` : ''}
                  </span>
                </div>
              </div>

              {/* Actions: Responsive visibility for touch/mobile devices & desktop hover */}
              {confirmDeleteId === source.id ? (
                <div 
                  className="flex items-center gap-1.5 shrink-0 animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                  role="alertdialog"
                  aria-label={`Confirm delete ${source.title}`}
                >
                  <span className="text-[11px] text-rose-500 font-medium">Delete?</span>
                  <button
                    type="button"
                    onClick={(e) => executeDeleteSource(source.id, e)}
                    disabled={deletingId === source.id}
                    className="px-2.5 py-1 min-h-[30px] rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    title="Confirm delete"
                    aria-label="Confirm delete source"
                  >
                    {deletingId === source.id ? (
                      <RotateCw className="w-3 h-3 animate-spin" />
                    ) : (
                      'Yes'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(null);
                    }}
                    disabled={deletingId === source.id}
                    className="px-2.5 py-1 min-h-[30px] rounded-lg bg-surface-base hover:bg-surface-border text-inherit text-[11px] transition-colors"
                    title="Cancel"
                    aria-label="Cancel delete source"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div 
                  className="flex items-center gap-1 opacity-90 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onViewSource(source)}
                    className="p-2 lg:p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 hover:bg-surface-border text-inherit transition-colors"
                    title="View Source Content"
                    aria-label={`View content of ${source.title}`}
                  >
                    <Eye className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(source.id)}
                    disabled={deletingId === source.id}
                    className="p-2 lg:p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 hover:bg-surface-border text-rose-500 disabled:opacity-30 transition-colors"
                    title="Delete Source"
                    aria-label={`Delete source ${source.title}`}
                  >
                    <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
