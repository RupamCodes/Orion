import { PodcastDialogueLine } from './types';

export interface SpeakerVoiceAssignment {
  speakerKey: string;
  speakerDisplayName: string;
  voice: SpeechSynthesisVoice | null;
  pitch: number;
}

export interface VoiceStatus {
  hasVoices: boolean;
  totalVoices: number;
  englishVoicesCount: number;
  isSingleVoiceFallback: boolean;
  hostAVoiceName: string;
  hostBVoiceName: string;
}

export function normalizeSpeakerKey(speaker: string): string {
  const s = speaker.toLowerCase().trim();
  if (s.includes('alex') || s.includes('host a')) return 'host_a';
  if (s.includes('sam') || s.includes('host b')) return 'host_b';
  // Fallback to normalized alphanumeric key for other speakers (e.g. User Interruption)
  return s.replace(/[^a-z0-9]/g, '_');
}

function getVoiceGenderAffinity(voice: SpeechSynthesisVoice): 'male' | 'female' | 'neutral' {
  const name = voice.name.toLowerCase();
  if (/(female|woman|samantha|victoria|karen|moira|tessa|fiona|veena|zira|aria|jenny|sara|catherine|allison|eva|susan|stephanie|helena)/i.test(name)) {
    return 'female';
  }
  if (/(male|man|david|alex|daniel|fred|george|aaron|oliver|mark|guy|natural|tom|lee|rishi|james|michael|john)/i.test(name)) {
    return 'male';
  }
  return 'neutral';
}

class DualSpeakerAudioEngine {
  private synth: SpeechSynthesis | null = null;
  private isPlaying: boolean = false;
  private isPausedState: boolean = false;
  private currentLineIndex: number = 0;
  private playbackRate: number = 1.0;
  private onLineChangeCallback?: (lineIndex: number) => void;
  private onStateChangeCallback?: (isPlaying: boolean) => void;
  private lines: PodcastDialogueLine[] = [];
  private voices: SpeechSynthesisVoice[] = [];
  private activeSessionId: number = 0;
  private voicesChangedHandler: (() => void) | null = null;

  // Speaker-to-voice mapping and custom user overrides
  private customVoiceUriMap: Map<string, string> = new Map();
  private speakerVoiceMap: Map<string, SpeakerVoiceAssignment> = new Map();
  private voicesListeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      this.voicesChangedHandler = () => {
        this.loadVoices();
        this.updateVoiceAssignments();
        this.notifyVoicesListeners();
      };

      if (this.synth.addEventListener) {
        this.synth.addEventListener('voiceschanged', this.voicesChangedHandler);
      } else {
        this.synth.onvoiceschanged = this.voicesChangedHandler;
      }
    }
  }

  private loadVoices() {
    if (this.synth) {
      try {
        const list = this.synth.getVoices();
        if (list && list.length > 0) {
          this.voices = list;
          this.updateVoiceAssignments();
        }
      } catch {
        this.voices = [];
      }
    }
  }

  private notifyVoicesListeners() {
    this.voicesListeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('Error in voice listener callback:', err);
      }
    });
  }

  public subscribeVoicesChanged(listener: () => void): () => void {
    this.voicesListeners.add(listener);
    return () => {
      this.voicesListeners.delete(listener);
    };
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    return this.voices;
  }

  public getEnglishVoices(): SpeechSynthesisVoice[] {
    const all = this.getAvailableVoices();
    const en = all.filter(v => v.lang.toLowerCase().startsWith('en'));
    return en.length > 0 ? en : all;
  }

  /**
   * Automatically resolves distinct voices for Host A and Host B
   * taking into account custom overrides and installed browser voices.
   */
  private updateVoiceAssignments() {
    const candidates = this.getEnglishVoices();
    if (candidates.length === 0) {
      this.speakerVoiceMap.clear();
      return;
    }

    const hostACustomUri = this.customVoiceUriMap.get('host_a');
    const hostBCustomUri = this.customVoiceUriMap.get('host_b');

    let voiceA: SpeechSynthesisVoice | null = null;
    let voiceB: SpeechSynthesisVoice | null = null;

    if (candidates.length >= 2) {
      // 1. Resolve Voice A
      if (hostACustomUri) {
        voiceA = candidates.find(v => v.voiceURI === hostACustomUri) || null;
      }
      if (!voiceA) {
        // Prefer male or first candidate
        const maleCandidate = candidates.find(v => getVoiceGenderAffinity(v) === 'male');
        voiceA = maleCandidate || candidates[0];
      }

      // 2. Resolve Voice B (must be distinct from Voice A)
      if (hostBCustomUri && hostBCustomUri !== voiceA.voiceURI) {
        voiceB = candidates.find(v => v.voiceURI === hostBCustomUri) || null;
      }
      if (!voiceB) {
        // Prefer female or contrasting candidate distinct from voiceA
        const femaleCandidate = candidates.find(
          v => v.voiceURI !== voiceA!.voiceURI && getVoiceGenderAffinity(v) === 'female'
        );
        voiceB = femaleCandidate || candidates.find(v => v.voiceURI !== voiceA!.voiceURI) || candidates[1];
      }

      // In case both resolved to same URI (safety check)
      if (voiceA.voiceURI === voiceB.voiceURI) {
        const alt = candidates.find(v => v.voiceURI !== voiceA!.voiceURI);
        if (alt) voiceB = alt;
      }

      // Assign with natural pitches
      this.speakerVoiceMap.set('host_a', {
        speakerKey: 'host_a',
        speakerDisplayName: 'Host A (Alex)',
        voice: voiceA,
        pitch: 1.0,
      });

      this.speakerVoiceMap.set('host_b', {
        speakerKey: 'host_b',
        speakerDisplayName: 'Host B (Sam)',
        voice: voiceB,
        pitch: 1.05, // Slightly higher/brighter for contrast
      });
    } else {
      // Single voice fallback: apply documented pitch separation
      const singleVoice = candidates[0];
      this.speakerVoiceMap.set('host_a', {
        speakerKey: 'host_a',
        speakerDisplayName: 'Host A (Alex)',
        voice: singleVoice,
        pitch: 0.88, // Distinct lower pitch
      });

      this.speakerVoiceMap.set('host_b', {
        speakerKey: 'host_b',
        speakerDisplayName: 'Host B (Sam)',
        voice: singleVoice,
        pitch: 1.18, // Distinct higher pitch
      });
    }
  }

  /**
   * Custom voice selection for hosts. Guarantees distinct voices when >= 2 available.
   */
  public setHostVoice(host: 'host_a' | 'host_b', voiceURI: string) {
    const candidates = this.getEnglishVoices();
    if (candidates.length === 0) return;

    this.customVoiceUriMap.set(host, voiceURI);

    // If both hosts were assigned the same voice and >= 2 voices exist, reassign the other host
    const otherHost = host === 'host_a' ? 'host_b' : 'host_a';
    const otherUri = this.customVoiceUriMap.get(otherHost);

    if (candidates.length >= 2 && (!otherUri || otherUri === voiceURI)) {
      const altVoice = candidates.find(v => v.voiceURI !== voiceURI);
      if (altVoice) {
        this.customVoiceUriMap.set(otherHost, altVoice.voiceURI);
      }
    }

    this.updateVoiceAssignments();
    this.notifyVoicesListeners();
  }

  public getHostVoiceURI(host: 'host_a' | 'host_b'): string {
    const assignment = this.speakerVoiceMap.get(host);
    return assignment?.voice?.voiceURI || this.customVoiceUriMap.get(host) || '';
  }

  public getVoiceStatus(): VoiceStatus {
    const candidates = this.getEnglishVoices();
    const assignmentA = this.speakerVoiceMap.get('host_a');
    const assignmentB = this.speakerVoiceMap.get('host_b');

    const isSingleVoiceFallback = candidates.length === 1 || 
      (assignmentA?.voice !== null && assignmentA?.voice?.voiceURI === assignmentB?.voice?.voiceURI);

    return {
      hasVoices: candidates.length > 0,
      totalVoices: this.voices.length,
      englishVoicesCount: candidates.length,
      isSingleVoiceFallback,
      hostAVoiceName: assignmentA?.voice?.name || 'Default System Voice',
      hostBVoiceName: assignmentB?.voice?.name || 'Default System Voice',
    };
  }

  /**
   * Preview a voice briefly for Host A or Host B
   */
  public previewVoice(host: 'host_a' | 'host_b') {
    if (!this.synth) return;
    this.synth.cancel();
    const assignment = this.speakerVoiceMap.get(host);
    const text = host === 'host_a' 
      ? "Hi, I'm Alex. Welcome to Orion Audio Overview." 
      : "Hello, I'm Sam. Ready to explore the source notes with you.";

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.playbackRate;
    if (assignment?.voice) {
      utterance.voice = assignment.voice;
      utterance.lang = assignment.voice.lang || 'en-US';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.pitch = assignment?.pitch ?? (host === 'host_a' ? 0.9 : 1.15);
    this.synth.speak(utterance);
  }

  public getSpeakerAssignment(speaker: string): SpeakerVoiceAssignment {
    const key = normalizeSpeakerKey(speaker);

    if (this.speakerVoiceMap.has(key)) {
      return this.speakerVoiceMap.get(key)!;
    }

    // For secondary speakers (e.g. User Interruption, Narrator)
    const candidates = this.getEnglishVoices();
    const currentAssignmentsCount = this.speakerVoiceMap.size;
    let voice: SpeechSynthesisVoice | null = null;
    let pitch = 1.0;

    if (candidates.length >= 3) {
      // Pick a third distinct voice
      const hostAVoice = this.speakerVoiceMap.get('host_a')?.voice;
      const hostBVoice = this.speakerVoiceMap.get('host_b')?.voice;
      voice = candidates.find(
        v => v.voiceURI !== hostAVoice?.voiceURI && v.voiceURI !== hostBVoice?.voiceURI
      ) || candidates[2 % candidates.length];
    } else if (candidates.length > 0) {
      voice = candidates[currentAssignmentsCount % candidates.length];
      pitch = 1.1; // Moderate pitch offset for distinctness
    }

    const assignment: SpeakerVoiceAssignment = {
      speakerKey: key,
      speakerDisplayName: speaker,
      voice,
      pitch,
    };
    this.speakerVoiceMap.set(key, assignment);
    return assignment;
  }

  public cleanup() {
    this.stop();
    if (this.synth && this.voicesChangedHandler) {
      if (this.synth.removeEventListener) {
        this.synth.removeEventListener('voiceschanged', this.voicesChangedHandler);
      } else if (this.synth.onvoiceschanged === this.voicesChangedHandler) {
        this.synth.onvoiceschanged = null;
      }
      this.voicesChangedHandler = null;
    }
    this.voicesListeners.clear();
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
      onStateChange?.(false);
      return;
    }

    // Ensure voices are loaded and assigned
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    this.updateVoiceAssignments();

    this.activeSessionId++;
    this.synth.cancel();
    this.lines = lines;
    this.currentLineIndex = Math.max(0, Math.min(startIndex, Math.max(0, lines.length - 1)));
    this.isPlaying = true;
    this.isPausedState = false;
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

    const currentSession = this.activeSessionId;
    const lineIndex = this.currentLineIndex;
    const line = this.lines[lineIndex];
    if (!line) {
      this.stop();
      return;
    }

    this.onLineChangeCallback?.(lineIndex);

    // Cancel previous utterance to avoid overlap
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.rate = this.playbackRate;

    // Refresh voices if list was initially empty when page loaded
    if (this.voices.length === 0) {
      this.loadVoices();
    }

    // Assign distinct voice & pitch for this turn based on speaker
    const assignment = this.getSpeakerAssignment(line.speaker);
    if (assignment.voice) {
      utterance.voice = assignment.voice;
      utterance.lang = assignment.voice.lang || 'en-US';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.pitch = assignment.pitch;

    utterance.onend = () => {
      // Guard against stale callbacks
      if (this.activeSessionId !== currentSession) return;
      if (!this.isPlaying || this.isPausedState) return;

      this.currentLineIndex++;
      if (this.currentLineIndex < this.lines.length) {
        setTimeout(() => {
          if (this.activeSessionId === currentSession && this.isPlaying && !this.isPausedState) {
            this.speakCurrentLine();
          }
        }, 300);
      } else {
        this.stop();
      }
    };

    utterance.onerror = (e) => {
      // Interrupted/canceled events occur intentionally on pause or track jump
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (this.activeSessionId !== currentSession) return;
      this.stop();
    };

    this.synth.speak(utterance);
  }

  public pause() {
    if (!this.synth || !this.isPlaying) return;
    this.isPlaying = false;
    this.isPausedState = true;
    this.synth.pause();
    this.onStateChangeCallback?.(false);
  }

  public resume() {
    if (!this.synth || this.isPlaying) return;
    this.isPlaying = true;
    this.isPausedState = false;
    this.onStateChangeCallback?.(true);

    if (this.synth.paused) {
      this.synth.resume();
    } else {
      // Fallback if browser didn't maintain paused utterance
      this.speakCurrentLine();
    }
  }

  public isPaused(): boolean {
    return this.isPausedState;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentLineIndex(): number {
    return this.currentLineIndex;
  }

  public nextLine() {
    if (this.lines.length === 0) return;
    const nextIdx = Math.min(this.currentLineIndex + 1, this.lines.length - 1);
    this.goToLine(nextIdx);
  }

  public prevLine() {
    if (this.lines.length === 0) return;
    const prevIdx = Math.max(0, this.currentLineIndex - 1);
    this.goToLine(prevIdx);
  }

  public goToLine(index: number) {
    if (this.lines.length === 0) return;
    const validIdx = Math.max(0, Math.min(index, this.lines.length - 1));
    this.currentLineIndex = validIdx;
    this.onLineChangeCallback?.(validIdx);
    if (this.isPlaying) {
      this.activeSessionId++;
      this.speakCurrentLine();
    }
  }

  public stop() {
    this.activeSessionId++;
    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.isPausedState = false;
    this.currentLineIndex = 0;
    this.onStateChangeCallback?.(false);
    this.onLineChangeCallback?.(0);
  }
}

export const audioPlayerEngine = new DualSpeakerAudioEngine();

