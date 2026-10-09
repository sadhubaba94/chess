/**
 * Move sounds synthesised with the Web Audio API: no audio files, so no asset licensing.
 * The AudioContext is created lazily on first use (after a user gesture).
 */
export type SoundName = 'move' | 'capture' | 'check' | 'result' | 'illegal';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, gain: number, type: OscillatorType): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playSound(name: SoundName): void {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime;
  switch (name) {
    case 'move':
      tone(ac, 520, t, 0.07, 0.18, 'triangle');
      break;
    case 'capture':
      tone(ac, 300, t, 0.1, 0.25, 'triangle');
      tone(ac, 180, t + 0.02, 0.12, 0.18, 'sine');
      break;
    case 'check':
      tone(ac, 660, t, 0.09, 0.18, 'square');
      tone(ac, 880, t + 0.1, 0.12, 0.14, 'square');
      break;
    case 'result':
      tone(ac, 523, t, 0.35, 0.16, 'sine');
      tone(ac, 659, t + 0.08, 0.35, 0.14, 'sine');
      tone(ac, 784, t + 0.16, 0.45, 0.12, 'sine');
      break;
    case 'illegal':
      tone(ac, 140, t, 0.12, 0.15, 'sawtooth');
      break;
  }
}
