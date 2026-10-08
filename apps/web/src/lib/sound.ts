import { create } from 'zustand';
import { local } from './storage';

/**
 * Efeitos sonoros sintetizados (WebAudio), sem arquivos.
 * Desligados por padrão; o AudioContext só é criado após o usuário ligar o som (interação explícita).
 */
type Cue = 'check' | 'success' | 'tick' | 'reveal' | 'join' | 'start';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.08) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  amp.gain.setValueAtTime(0, ac.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

const CUES: Record<Cue, (ac: AudioContext) => void> = {
  check: (ac) => tone(ac, 880, 0, 0.12, 'triangle'),
  success: (ac) => [523, 659, 784, 1046].forEach((f, i) => tone(ac, f, i * 0.07, 0.22, 'triangle', 0.07)),
  tick: (ac) => tone(ac, 1200, 0, 0.05, 'square', 0.03),
  reveal: (ac) => [392, 523, 659].forEach((f, i) => tone(ac, f, i * 0.09, 0.3, 'sine', 0.06)),
  join: (ac) => tone(ac, 660, 0, 0.1, 'sine', 0.05),
  start: (ac) => [440, 880].forEach((f, i) => tone(ac, f, i * 0.12, 0.18, 'triangle', 0.06)),
};

interface SoundState {
  enabled: boolean;
  toggle(): void;
}

export const useSound = create<SoundState>((set, get) => ({
  enabled: local.get<boolean>('codearena:sound') ?? false,
  toggle() {
    const enabled = !get().enabled;
    local.set('codearena:sound', enabled);
    if (enabled) context();
    set({ enabled });
  },
}));

export function playCue(cue: Cue): void {
  if (!useSound.getState().enabled) return;
  const ac = context();
  if (ac) CUES[cue](ac);
}
