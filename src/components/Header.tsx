'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  Settings, 
  Sun, 
  Moon, 
  BookOpen, 
  ChevronDown, 
  Plus, 
  Check, 
  RotateCw, 
  AlertCircle 
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Notebook } from '../lib/types';

interface HeaderProps {
  sourcesCount: number;
  selectedSourcesCount: number;
  isOllamaConnected: boolean;
  selectedModel: string;
  onOpenSettings: () => void;
  // Notebook integration props
  activeNotebook: Notebook | null;
  notebooks: Notebook[];
  isLoadingNotebooks?: boolean;
  notebookError?: string | null;
  onSelectNotebook: (notebook: Notebook) => void;
  onCreateNotebook: (title: string, description?: string) => Promise<boolean>;
  onRefreshNotebooks?: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  sourcesCount,
  selectedSourcesCount,
  isOllamaConnected,
  selectedModel,
  onOpenSettings,
  activeNotebook,
  notebooks,
  isLoadingNotebooks = false,
  notebookError = null,
  onSelectNotebook,
  onCreateNotebook,
  onRefreshNotebooks
}) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const success = await onCreateNotebook(trimmed);
    setIsSubmitting(false);

    if (success) {
      setNewTitle('');
      setIsCreating(false);
      setIsOpen(false);
    }
  };

  return (
    <header className="h-12 shrink-0 border-b border-surface-border bg-surface-panel px-5 flex items-center justify-between sticky top-0 z-40 transition-colors">
      {/* Wordmark & Notebook Switcher */}
      <div className="flex items-center gap-3 select-none">
        <span className="text-sm font-semibold tracking-tight font-sans">
          Orion
        </span>

        <span className="text-surface-border text-sm opacity-60">/</span>

        {/* Notebook Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover border border-transparent hover:border-surface-border transition-colors text-xs font-medium text-inherit max-w-[200px] md:max-w-[280px]"
            title="Switch notebook"
            aria-label="Notebook switcher"
            aria-expanded={isOpen}
          >
            <BookOpen className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <span className="truncate">
              {activeNotebook
                ? activeNotebook.title
                : isLoadingNotebooks
                ? 'Loading...'
                : 'Select Notebook'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 opacity-60 shrink-0 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Switcher Popover */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 rounded-xl bg-surface-panel border border-surface-border shadow-xl z-50 p-2 animate-fade-in text-inherit">
              {/* Popover Header */}
              <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-surface-border pb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60 font-mono">
                  Notebooks
                </span>
                {onRefreshNotebooks && (
                  <button
                    onClick={async () => {
                      await onRefreshNotebooks();
                    }}
                    className="p-1 rounded hover:bg-surface-hover opacity-60 hover:opacity-100 transition-opacity"
                    title="Refresh notebooks"
                    aria-label="Refresh notebooks"
                  >
                    <RotateCw
                      className={`w-3 h-3 ${isLoadingNotebooks ? 'animate-spin' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* Backend Error / Offline Notice */}
              {notebookError && (
                <div className="p-2 mb-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Backend Unavailable</p>
                    <p className="opacity-80 text-[10px] leading-tight mt-0.5">
                      {notebookError}
                    </p>
                  </div>
                </div>
              )}

              {/* Notebooks List */}
              <div className="max-h-56 overflow-y-auto space-y-0.5 py-1">
                {isLoadingNotebooks && notebooks.length === 0 ? (
                  <div className="p-3 text-center text-xs opacity-50 flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground-base animate-pulse" />
                    <span>Loading notebooks...</span>
                  </div>
                ) : notebooks.length === 0 ? (
                  <div className="p-3 text-center text-xs opacity-50">
                    No notebooks available.
                  </div>
                ) : (
                  notebooks.map((nb) => {
                    const isSelected = activeNotebook?.id === nb.id;
                    return (
                      <button
                        key={nb.id}
                        onClick={() => {
                          onSelectNotebook(nb);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          isSelected
                            ? 'bg-surface-hover text-inherit font-medium border border-surface-borderHover'
                            : 'hover:bg-surface-hover text-inherit opacity-80 hover:opacity-100 border border-transparent'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="truncate">{nb.title}</span>
                          {nb.description && (
                            <span className="text-[10px] opacity-50 truncate">
                              {nb.description}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* New Notebook Action / Form */}
              <div className="pt-2 border-t border-surface-border mt-1">
                {!isCreating ? (
                  <button
                    onClick={() => {
                      setIsCreating(true);
                      setNewTitle('');
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs hover:bg-surface-hover transition-colors opacity-80 hover:opacity-100 text-left font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Notebook</span>
                  </button>
                ) : (
                  <form onSubmit={handleCreateSubmit} className="space-y-1.5 p-1">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Notebook title..."
                      autoFocus
                      disabled={isSubmitting}
                      className="w-full bg-surface-base border border-surface-border rounded-lg px-2.5 py-1 text-xs text-inherit focus:outline-none focus:border-surface-borderHover"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsCreating(false);
                          setNewTitle('');
                        }
                      }}
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          setNewTitle('');
                        }}
                        disabled={isSubmitting}
                        className="px-2 py-0.5 rounded text-[11px] opacity-60 hover:opacity-100 hover:bg-surface-hover"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newTitle.trim() || isSubmitting}
                        className="px-2.5 py-0.5 rounded bg-zinc-900 text-white dark:bg-white dark:text-black font-medium text-[11px] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {sourcesCount > 0 && (
          <span className="text-[11px] font-mono opacity-60 hidden sm:inline">
            ({selectedSourcesCount} active)
          </span>
        )}
      </div>

      {/* Settings, Model Status & Theme */}
      <div className="flex items-center gap-2">
        {/* Model Status Indicator */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${
            isOllamaConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
              : 'bg-zinc-500/10 border-surface-border text-zinc-600 dark:text-zinc-400 hover:bg-surface-hover'
          }`}
          title={
            isOllamaConnected
              ? `Connected to Ollama (${selectedModel}). Click to open settings.`
              : 'Ollama is offline or unreachable. Click to configure host & model.'
          }
          aria-label={
            isOllamaConnected
              ? `Ollama connected with model ${selectedModel}`
              : 'Ollama offline'
          }
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isOllamaConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-500'
            }`}
          />
          <span className="font-mono text-[11px] font-medium truncate max-w-[120px] hidden sm:inline">
            {isOllamaConnected ? selectedModel : 'Ollama Offline'}
          </span>
          <span className="text-[10px] font-mono sm:hidden">
            {isOllamaConnected ? 'Ollama' : 'Offline'}
          </span>
        </button>

        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
