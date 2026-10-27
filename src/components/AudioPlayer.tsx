'use client';

import React, { useState, useEffect } from 'react';
import { PodcastDialogueLine } from '../lib/types';
import { audioPlayerEngine, VoiceStatus } from '../lib/tts-engine';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download,
  SkipBack,
  SkipForward,
  Volume2,
  ChevronDown,
  ChevronUp,
  Check
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

  // Voice selection and state
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [hostAVoiceUri, setHostAVoiceUri] = useState<string>('');
  const [hostBVoiceUri, setHostBVoiceUri] = useState<string>('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);

  // Synchronize available voices from the audio engine
  useEffect(() => {
    const updateVoices = () => {
      const vList = audioPlayerEngine.getEnglishVoices();
      setVoices(vList);
      setHostAVoiceUri(audioPlayerEngine.getHostVoiceURI('host_a'));
      setHostBVoiceUri(audioPlayerEngine.getHostVoiceURI('host_b'));
      setVoiceStatus(audioPlayerEngine.getVoiceStatus());
    };

    updateVoices();
    const unsubscribe = audioPlayerEngine.subscribeVoicesChanged(updateVoices);

    return () => {
      unsubscribe();
    };
  }, []);

  // Sync state and stop audio on unmount or when dialogue changes
  useEffect(() => {
    audioPlayerEngine.stop();
    setCurrentLineIndex(0);
    setIsPlaying(false);

    return () => {
      audioPlayerEngine.stop();
    };
  }, [dialogue]);

  const handlePlayToggle = () => {
    if (isPlaying) {
      audioPlayerEngine.pause();
      setIsPlaying(false);
    } else {
      if (audioPlayerEngine.isPaused()) {
        audioPlayerEngine.resume();
        setIsPlaying(true);
      } else {
        audioPlayerEngine.playPodcast(
          dialogue,
          currentLineIndex,
          (lineIndex) => setCurrentLineIndex(lineIndex),
          (playing) => setIsPlaying(playing)
        );
        setIsPlaying(true);
      }
    }
  };

  const handleReset = () => {
    audioPlayerEngine.stop();
    setCurrentLineIndex(0);
    setIsPlaying(false);
  };

  const handlePrevLine = () => {
    if (currentLineIndex > 0) {
      const prevIdx = currentLineIndex - 1;
      setCurrentLineIndex(prevIdx);
      audioPlayerEngine.goToLine(prevIdx);
    }
  };

  const handleNextLine = () => {
    if (currentLineIndex < dialogue.length - 1) {
      const nextIdx = currentLineIndex + 1;
      setCurrentLineIndex(nextIdx);
      audioPlayerEngine.goToLine(nextIdx);
    }
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
            2 Speakers • {dialogue.length} lines
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
              onClick={handlePrevLine}
              disabled={currentLineIndex === 0}
              className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border transition-colors opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous Line"
              aria-label="Previous Line"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handlePlayToggle}
              disabled={dialogue.length === 0}
              className="p-1.5 rounded-full bg-foreground-base text-surface-base hover:opacity-80 transition-all shadow-sm disabled:opacity-30"
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={handleNextLine}
              disabled={currentLineIndex >= dialogue.length - 1}
              className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border transition-colors opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next Line"
              aria-label="Next Line"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border transition-colors opacity-70 hover:opacity-100"
              title="Reset"
              aria-label="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={cycleSpeed}
              className="px-2 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover text-xs font-mono border border-surface-border transition-colors opacity-70 hover:opacity-100"
              title="Playback speed"
            >
              {playbackRate}x
            </button>

            <button
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
                showVoiceSettings
                  ? 'bg-surface-hover border-surface-borderHover text-foreground-base'
                  : 'bg-surface-panel hover:bg-surface-hover border-surface-border opacity-70 hover:opacity-100'
              }`}
              title="Host Voice Settings"
              aria-label="Host Voice Settings"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Voices</span>
              {showVoiceSettings ? (
                <ChevronUp className="w-3 h-3 opacity-60" />
              ) : (
                <ChevronDown className="w-3 h-3 opacity-60" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={downloadTranscript}
              className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors opacity-60 hover:opacity-100"
              title="Download Transcript"
              aria-label="Download Transcript"
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

        {/* Compact Voice Selection Panel */}
        {showVoiceSettings && (
          <div className="pt-3 border-t border-surface-border space-y-2.5 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[11px] opacity-75">
              <span className="font-medium">Speaker Voice Assignments</span>
              {voiceStatus?.isSingleVoiceFallback ? (
                <span className="flex items-center gap-1 text-amber-500 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                  1 voice: Pitch separated
                </span>
              ) : voiceStatus?.hasVoices ? (
                <span className="flex items-center gap-1 text-emerald-500 font-mono text-[10px]">
                  <Check className="w-3 h-3" />
                  Distinct voices active
                </span>
              ) : (
                <span className="text-foreground-muted font-mono text-[10px]">Detecting voices...</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Host A Voice Selector */}
              <div className="p-2 rounded-xl bg-surface-panel border border-surface-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px] opacity-90">Host A (Alex)</span>
                  <button
                    type="button"
                    onClick={() => audioPlayerEngine.previewVoice('host_a')}
                    className="px-1.5 py-0.5 rounded bg-surface-base hover:bg-surface-hover border border-surface-border text-[10px] opacity-80 hover:opacity-100 transition-colors"
                    title="Test Host A voice"
                  >
                    Test
                  </button>
                </div>
                <select
                  value={hostAVoiceUri}
                  onChange={(e) => {
                    const uri = e.target.value;
                    audioPlayerEngine.setHostVoice('host_a', uri);
                    setHostAVoiceUri(audioPlayerEngine.getHostVoiceURI('host_a'));
                    setHostBVoiceUri(audioPlayerEngine.getHostVoiceURI('host_b'));
                    setVoiceStatus(audioPlayerEngine.getVoiceStatus());
                  }}
                  className="w-full bg-surface-base border border-surface-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-surface-borderHover truncate"
                >
                  {voices.length === 0 ? (
                    <option value="">Default System Voice</option>
                  ) : (
                    voices.map((v) => {
                      const isSelectedByB = voices.length >= 2 && v.voiceURI === hostBVoiceUri;
                      return (
                        <option 
                          key={v.voiceURI} 
                          value={v.voiceURI}
                          disabled={isSelectedByB}
                        >
                          {v.name} ({v.lang}){isSelectedByB ? ' (In Use by Sam)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              {/* Host B Voice Selector */}
              <div className="p-2 rounded-xl bg-surface-panel border border-surface-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px] opacity-90">Host B (Sam)</span>
                  <button
                    type="button"
                    onClick={() => audioPlayerEngine.previewVoice('host_b')}
                    className="px-1.5 py-0.5 rounded bg-surface-base hover:bg-surface-hover border border-surface-border text-[10px] opacity-80 hover:opacity-100 transition-colors"
                    title="Test Host B voice"
                  >
                    Test
                  </button>
                </div>
                <select
                  value={hostBVoiceUri}
                  onChange={(e) => {
                    const uri = e.target.value;
                    audioPlayerEngine.setHostVoice('host_b', uri);
                    setHostAVoiceUri(audioPlayerEngine.getHostVoiceURI('host_a'));
                    setHostBVoiceUri(audioPlayerEngine.getHostVoiceURI('host_b'));
                    setVoiceStatus(audioPlayerEngine.getVoiceStatus());
                  }}
                  className="w-full bg-surface-base border border-surface-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-surface-borderHover truncate"
                >
                  {voices.length === 0 ? (
                    <option value="">Default System Voice</option>
                  ) : (
                    voices.map((v) => {
                      const isSelectedByA = voices.length >= 2 && v.voiceURI === hostAVoiceUri;
                      return (
                        <option 
                          key={v.voiceURI} 
                          value={v.voiceURI}
                          disabled={isSelectedByA}
                        >
                          {v.name} ({v.lang}){isSelectedByA ? ' (In Use by Alex)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            </div>
          </div>
        )}
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
