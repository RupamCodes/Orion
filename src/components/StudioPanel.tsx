'use client';

import React, { useState, useEffect } from 'react';
import { SourceDoc, StudioArtifact, NoteItem } from '../lib/types';
import { AudioPlayer } from './AudioPlayer';
import { generatePodcastScript } from '../lib/local-rag';
import { 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink,
  AudioLines,
  FileText,
  Share2,
  FileBarChart,
  PieChart
} from 'lucide-react';

interface StudioPanelProps {
  sources: SourceDoc[];
  artifacts: StudioArtifact[];
  notes: NoteItem[];
  onUpdateNotes: (notes: NoteItem[]) => void;
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
}

export const StudioPanel: React.FC<StudioPanelProps> = ({
  sources,
  artifacts,
  notes,
  onUpdateNotes,
  onOpenSourceModal
}) => {
  const [activeView, setActiveView] = useState<'grid' | 'audio'>('grid');
  const [isGenerating, setIsGenerating] = useState(false);
  const [podcastDialogue, setPodcastDialogue] = useState<any[]>([]);
  const [podcastTitle, setPodcastTitle] = useState('Audio Overview');

  const selectedSources = sources.filter(s => s.isSelected);
  const totalWordCount = selectedSources.reduce((acc, s) => acc + s.wordCount, 0);

  useEffect(() => {
    if (selectedSources.length > 0) {
      const activeTitles = selectedSources.map(s => s.title).join(', ');
      setPodcastTitle(`Discussion: ${selectedSources[0].title.slice(0, 28)}...`);
      setPodcastDialogue(generatePodcastScript(activeTitles, selectedSources));
    } else {
      setPodcastDialogue([]);
    }
  }, [sources]);

  const handleRegeneratePodcast = () => {
    if (selectedSources.length === 0) return;
    setIsGenerating(true);
    setTimeout(() => {
      const activeTitles = selectedSources.map(s => s.title).join(', ');
      setPodcastDialogue(generatePodcastScript(activeTitles, selectedSources));
      setIsGenerating(false);
      setActiveView('audio');
    }, 900);
  };

  const gridItems = [
    {
      id: 'audio',
      label: 'Audio Overview',
      icon: AudioLines,
      isDisabled: selectedSources.length === 0,
      disabledReason: 'Add at least one source to generate an Audio Overview.',
      onClick: () => {
        if (podcastDialogue.length === 0) handleRegeneratePodcast();
        setActiveView('audio');
      }
    },
    {
      id: 'flashcards',
      label: 'Flashcards',
      icon: Copy,
      isDisabled: selectedSources.length === 0 || totalWordCount < 50,
      disabledReason: selectedSources.length === 0 ? 'Add sources to generate Flashcards.' : 'Need more text (at least 50 words) for Flashcards.',
      onClick: () => {}
    },
    {
      id: 'mindmap',
      label: 'Mind Map',
      icon: Share2,
      isDisabled: selectedSources.length === 0,
      disabledReason: 'Add sources to map out relationships.',
      onClick: () => {}
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
      isDisabled: selectedSources.length === 0 || totalWordCount < 200,
      disabledReason: selectedSources.length === 0 ? 'Add sources to generate a Report.' : 'Need more text (at least 200 words) for a comprehensive report.',
      onClick: () => {}
    },
    {
      id: 'infographic',
      label: 'Infographic',
      icon: PieChart,
      isDisabled: selectedSources.length === 0,
      disabledReason: 'Add sources to generate an Infographic.',
      onClick: () => {}
    }
  ];

  return (
    <div className="h-full flex flex-col bg-surface-panel border-l border-surface-border select-none relative">
      <div className="p-4 border-b border-surface-border">
         <span className="text-sm font-semibold tracking-tight text-inherit opacity-90">
            Studio
         </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Studio Grid */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {gridItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              disabled={item.isDisabled}
              title={item.isDisabled ? item.disabledReason : `Generate ${item.label}`}
              className={`p-3 rounded-xl border flex flex-col items-start gap-2 transition-all text-left ${
                item.isDisabled
                  ? 'bg-surface-base border-surface-border opacity-50 cursor-not-allowed'
                  : 'bg-surface-base border-surface-border hover:border-surface-borderHover hover:bg-surface-hover cursor-pointer opacity-90 hover:opacity-100'
              }`}
            >
              <item.icon className="w-5 h-5 opacity-70" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        {activeView === 'audio' && (
          <div className="pt-4 border-t border-surface-border animate-fade-in">
            {selectedSources.length === 0 ? (
              <div className="text-center py-12 px-4 text-inherit opacity-60 text-xs">
                <p className="font-medium mb-1">No sources to discuss</p>
                <p className="opacity-70">Upload documents on the left to generate audio.</p>
              </div>
            ) : (
              <AudioPlayer
                dialogue={podcastDialogue}
                title={podcastTitle}
                onGenerateNew={handleRegeneratePodcast}
                isGenerating={isGenerating}
              />
            )}
          </div>
        )}

      </div>
    </div>
  );
};
