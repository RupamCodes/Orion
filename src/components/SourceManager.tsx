'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SourceDoc, SourceType } from '../lib/types';
import { chunkDocument } from '../lib/local-rag';
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
  FileText
} from 'lucide-react';

interface SourceManagerProps {
  sources: SourceDoc[];
  onUpdateSources: (sources: SourceDoc[]) => void;
  onViewSource: (source: SourceDoc) => void;
}

export const SourceManager: React.FC<SourceManagerProps> = ({
  sources,
  onUpdateSources,
  onViewSource
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'text' | 'link' | 'youtube' | null>(null);
  const [rawTitle, setRawTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
        setActiveInput(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSelectAll = () => {
    const allSelected = sources.every(s => s.isSelected);
    onUpdateSources(sources.map(s => ({ ...s, isSelected: !allSelected })));
  };

  const toggleSourceSelection = (id: string) => {
    onUpdateSources(
      sources.map(s => (s.id === id ? { ...s, isSelected: !s.isSelected } : s))
    );
  };

  const deleteSource = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateSources(sources.filter(s => s.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setIsPopoverOpen(false);
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
        type = 'txt';
        try {
          const result = await Tesseract.recognize(file, 'eng');
          extractedText = result.data.text;
        } catch(err) {
          console.error("OCR Error:", err);
          continue;
        }
      } else {
        type = 'txt';
        extractedText = await file.text();
      }

      if (!extractedText.trim()) continue;

      const sourceId = `src-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const chunks = chunkDocument(sourceId, extractedText);
      const wordCount = extractedText.trim().split(/\s+/).length;

      newSourcesList.push({
        id: sourceId,
        title: file.name,
        type,
        content: extractedText,
        summary: extractedText.slice(0, 160).replace(/\n+/g, ' ') + '...',
        wordCount,
        chunks,
        isSelected: true,
        createdAt: new Date().toISOString().split('T')[0],
        topics: [fileExt?.toUpperCase() || 'Document']
      });
    }

    if (newSourcesList.length > 0) {
      onUpdateSources([...newSourcesList, ...sources]);
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddManualSource = () => {
    if (!activeInput) return;

    let newSourcesList: SourceDoc[] = [];

    if (activeInput === 'text') {
      if (!rawContent.trim()) return;
      const sourceId = `src-${Date.now()}`;
      newSourcesList.push({
        id: sourceId,
        title: rawTitle.trim() || `Source ${sources.length + 1}`,
        type: 'note',
        content: rawContent,
        summary: rawContent.slice(0, 150) + '...',
        wordCount: rawContent.trim().split(/\s+/).length,
        chunks: chunkDocument(sourceId, rawContent),
        isSelected: true,
        createdAt: new Date().toISOString().split('T')[0],
        topics: ['Manual Entry']
      });
    } else if (activeInput === 'link' || activeInput === 'youtube') {
      const urls = rawContent.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length === 0) return;
      
      urls.forEach((url, index) => {
        const sourceId = `src-${Date.now()}-${index}`;
        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
        const mockContent = `This is mock extracted content from ${url}. In a real application, this would contain the parsed text from the website or the transcript of the YouTube video. The content discusses various topics related to the domain's primary focus.`;
        
        // Extract domain or video ID for title
        let extractedTitle = url;
        try {
          const parsedUrl = new URL(url);
          extractedTitle = parsedUrl.hostname.replace('www.', '') + parsedUrl.pathname;
        } catch (e) {
          // keep original if it fails
        }

        newSourcesList.push({
          id: sourceId,
          title: extractedTitle.slice(0, 40),
          type: isYoutube ? 'youtube' : 'link',
          content: mockContent,
          summary: mockContent.slice(0, 100) + '...',
          wordCount: mockContent.split(/\s+/).length,
          chunks: chunkDocument(sourceId, mockContent),
          isSelected: true,
          createdAt: new Date().toISOString().split('T')[0],
          topics: [isYoutube ? 'Video' : 'Website']
        });
      });
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
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-inherit opacity-90">
            Sources
          </span>

          <div className="flex items-center gap-2">
            {sources.length > 1 && (
              <button
                onClick={toggleSelectAll}
                className="text-xs text-inherit opacity-60 hover:opacity-100 transition-colors"
              >
                {sources.every(s => s.isSelected) ? 'Deselect all' : 'Select all'}
              </button>
            )}
            
            <button
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              disabled={isUploading}
              className="p-1.5 rounded-full bg-surface-hover border border-surface-border hover:border-surface-borderHover transition-all text-inherit disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Sources Popover */}
      {isPopoverOpen && (
        <div ref={popoverRef} className="absolute top-14 left-4 right-4 z-50 bg-surface-panel border border-surface-borderHover shadow-xl rounded-xl p-2 animate-fade-in flex flex-col">
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
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <Upload className="w-4 h-4" /> Upload files
              </button>
              <button onClick={() => setActiveInput('youtube')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <Youtube className="w-4 h-4" /> YouTube
              </button>
              <button onClick={() => setActiveInput('link')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <Link className="w-4 h-4" /> Websites
              </button>
              <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <BookOpen className="w-4 h-4" /> Play Books
              </button>
              <button onClick={() => setActiveInput('text')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <CopyIcon className="w-4 h-4" /> Copied text
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-sm text-inherit opacity-80 hover:opacity-100 transition-colors text-left">
                <PenTool className="w-4 h-4" /> Handwritten
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold capitalize opacity-80">Add {activeInput}</span>
                <button onClick={() => setActiveInput(null)} className="p-1 rounded hover:bg-surface-hover opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5"/></button>
              </div>
              
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
                placeholder={activeInput === 'text' ? "Paste text here..." : "Paste multiple URLs separated by newlines or commas..."}
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                rows={4}
                className="w-full bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-surface-borderHover resize-none"
              />
              
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={handleAddManualSource}
                  disabled={!rawContent.trim()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-all w-full"
                >
                  Add Source{activeInput === 'link' || activeInput === 'youtube' ? '(s)' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sources List or Empty State */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
        {isUploading && (
           <div className="p-3 rounded-xl border border-surface-border bg-surface-hover animate-pulse text-xs text-center opacity-70">
             Processing document...
           </div>
        )}
        
        {sources.length === 0 && !isUploading ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-50">
            <div className="text-sm font-medium mb-1">
              No sources
            </div>
            <p className="text-xs leading-relaxed max-w-[180px]">
              Click + to add documents, links, or text.
            </p>
          </div>
        ) : (
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
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div 
                  className="opacity-70 group-hover:opacity-100 shrink-0"
                  onClick={(e) => { e.stopPropagation(); toggleSourceSelection(source.id); }}
                >
                  {source.isSelected ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium truncate">
                    {source.title}
                  </span>
                  <span className="text-[10px] opacity-60 truncate">
                    {source.type.toUpperCase()} • {source.wordCount} words
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onViewSource(source); }}
                  className="p-1.5 rounded-md opacity-60 hover:opacity-100 hover:bg-surface-border"
                  title="View"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => deleteSource(source.id, e)}
                  className="p-1.5 rounded-md opacity-60 hover:opacity-100 hover:bg-surface-border text-rose-500"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
