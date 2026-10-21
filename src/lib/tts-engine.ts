import { PodcastDialogueLine } from './types';

class DualSpeakerAudioEngine {
  private synth: SpeechSynthesis | null = null;
  private isPlaying: boolean = false;
  private currentLineIndex: number = 0;
  private playbackRate: number = 1.0;
  private onLineChangeCallback?: (lineIndex: number) => void;
  private onStateChangeCallback?: (isPlaying: boolean) => void;
  private lines: PodcastDialogueLine[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public setRate(rate: number) {
    this.playbackRate = rate;
  }

  public playPodcast(
    lines: PodcastDialogueLine[], 
    startIndex: number = 0,
    onLineChange?: (lineIndex: number) => void,
    onStateChange?: (isPlaying: boolean) => void
  ) {
    if (!this.synth) {
      console.warn('Speech synthesis not supported in this environment');
      return;
    }

    this.stop();
    this.lines = lines;
    this.currentLineIndex = startIndex;
    this.isPlaying = true;
    this.onLineChangeCallback = onLineChange;
    this.onStateChangeCallback = onStateChange;
    this.onStateChangeCallback?.(true);

    this.speakCurrentLine();
  }

  private speakCurrentLine() {
    if (!this.synth || !this.isPlaying || this.currentLineIndex >= this.lines.length) {
      this.stop();
      return;
    }

    const line = this.lines[this.currentLineIndex];
    this.onLineChangeCallback?.(this.currentLineIndex);

    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.rate = this.playbackRate;

    // Distinguish Host A (Alex) and Host B (Sam)
    const voices = this.synth.getVoices();
    if (line.speaker.includes('Alex')) {
      utterance.pitch = 1.05;
      const maleVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Alex') || v.name.includes('Natural')));
      if (maleVoice) utterance.voice = maleVoice;
    } else {
      utterance.pitch = 0.95;
      const femaleOrAltVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Google') || v.name.includes('Zira')));
      if (femaleOrAltVoice) utterance.voice = femaleOrAltVoice;
    }

    utterance.onend = () => {
      if (this.isPlaying) {
        this.currentLineIndex++;
        if (this.currentLineIndex < this.lines.length) {
          // Small natural pause between dialogue turns
          setTimeout(() => this.speakCurrentLine(), 350);
        } else {
          this.stop();
        }
      }
    };

    utterance.onerror = () => {
      this.stop();
    };

    this.synth.speak(utterance);
  }

  public pause() {
    if (this.synth && this.isPlaying) {
      this.synth.pause();
      this.isPlaying = false;
      this.onStateChangeCallback?.(false);
    }
  }

  public resume() {
    if (this.synth && !this.isPlaying) {
      if (this.synth.paused) {
        this.synth.resume();
      } else {
        this.speakCurrentLine();
      }
      this.isPlaying = true;
      this.onStateChangeCallback?.(true);
    }
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.currentLineIndex = 0;
    this.onStateChangeCallback?.(false);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioPlayerEngine = new DualSpeakerAudioEngine();
