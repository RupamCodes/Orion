'use client';

import React, { useState, useEffect } from 'react';
import { PodcastDialogueLine } from '../lib/types';
import { audioPlayerEngine } from '../lib/tts-engine';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download
} from 'lucide-react';

interface AudioPlayerProps {
  dialogue: PodcastDialogueLine[];
  title: string;
  onGenerateNew?: () => void;
  isGenerating?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  dialogue,
  title,
  onGenerateNew,
  isGenerating = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  useEffect(() => {
    return () => {
      audioPlayerEngine.stop();
    };
  }, []);

  const handlePlayToggle = () => {
    if (isPlaying) {
      audioPlayerEngine.pause();
      setIsPlaying(false);
    } else {
      audioPlayerEngine.playPodcast(
        dialogue,
        currentLineIndex,
        (lineIndex) => setCurrentLineIndex(lineIndex),
        (playing) => setIsPlaying(playing)
      );
      setIsPlaying(true);
    }
  };

  const handleReset = () => {
    audioPlayerEngine.stop();
    setCurrentLineIndex(0);
    setIsPlaying(false);
  };

  const cycleSpeed = () => {
    const speeds = [1.0, 1.25, 1.5];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIndex];
    setPlaybackRate(nextRate);
    audioPlayerEngine.setRate(nextRate);
  };

  const downloadTranscript = () => {
    const text = dialogue.map(d => `${d.speaker}:\n${d.text}\n`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Orion_Discussion.txt`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Player Card */}
      <div className="rounded-2xl p-4 bg-surface-base border border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold truncate max-w-[200px] opacity-90">
            {title}
          </span>
          <span className="text-[10px] font-mono opacity-60">
            2 Speakers
          </span>
        </div>

        {/* Minimal Audio Visualizer Bar */}
        <div className="h-6 flex items-center justify-between gap-1 px-2 bg-surface-panel rounded border border-surface-border">
          {Array.from({ length: 24 }).map((_, idx) => (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-200 ${
                isPlaying
                  ? 'bg-foreground-base opacity-80'
                  : 'bg-surface-borderHover h-1 opacity-50'
              }`}
              style={{
                height: isPlaying ? `${Math.max(20, (Math.sin(idx * 0.8 + currentLineIndex * 2) * 35 + 45))}%` : '15%',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePlayToggle}
              className="p-1.5 rounded-full bg-foreground-base text-surface-base hover:opacity-80 transition-all shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border transition-colors opacity-70 hover:opacity-100"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={cycleSpeed}
              className="px-2 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover text-xs font-mono border border-surface-border transition-colors opacity-70 hover:opacity-100"
            >
              {playbackRate}x
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={downloadTranscript}
              className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors opacity-60 hover:opacity-100"
              title="Download Transcript"
            >
              <Download className="w-4 h-4" />
            </button>

            {onGenerateNew && (
              <button
                onClick={onGenerateNew}
                disabled={isGenerating}
                className="px-2.5 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {dialogue.map((line, idx) => {
          const isCurrent = currentLineIndex === idx && isPlaying;

          return (
            <div
              key={line.id}
              onClick={() => {
                setCurrentLineIndex(idx);
                audioPlayerEngine.playPodcast(
                  dialogue,
                  idx,
                  (lineIdx) => setCurrentLineIndex(lineIdx),
                  (playing) => setIsPlaying(playing)
                );
              }}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-surface-hover border-surface-borderHover'
                  : 'bg-surface-panel border-surface-border hover:border-surface-borderHover opacity-80 hover:opacity-100'
              }`}
            >
              <div className="text-[11px] font-semibold mb-1 opacity-90">
                {line.speaker}
              </div>
              <p className={`text-xs leading-relaxed ${isCurrent ? 'font-medium' : 'opacity-70'}`}>
                {line.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
