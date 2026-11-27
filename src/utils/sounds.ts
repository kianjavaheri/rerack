/**
 * Short sound effects for a live workout, drawn with Web Audio (no files to load). The audio session is "ambient", so
 * the ring/silent switch mutes them and music keeps playing under them.
 */

export type SoundName = 'set' | 'exercise' | 'workout' | 'rest';

type Note = { freq: number; at: number; dur: number; gain: number };

const SOUNDS: Record<SoundName, Note[]> = {
  set: [
    { freq: 880, at: 0, dur: 0.09, gain: 0.16 },
    { freq: 1320, at: 0.035, dur: 0.08, gain: 0.08 },
  ],
  exercise: [
    { freq: 784, at: 0, dur: 0.16, gain: 0.16 },
    { freq: 1047, at: 0.11, dur: 0.26, gain: 0.16 },
  ],
  workout: [
    { freq: 523, at: 0, dur: 0.18, gain: 0.15 },
    { freq: 659, at: 0.1, dur: 0.18, gain: 0.15 },
    { freq: 784, at: 0.2, dur: 0.2, gain: 0.15 },
    { freq: 1047, at: 0.3, dur: 0.45, gain: 0.17 },
  ],
  rest: [
    { freq: 988, at: 0, dur: 0.2, gain: 0.16 },
    { freq: 1319, at: 0.16, dur: 0.34, gain: 0.16 },
  ],
};

let ctx: AudioContext | null = null;
const lastPlayed = new Map<string, number>();

function context(): AudioContext | null {
  if (!ctx) {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Plays one of the sounds. With `key`, the same key within two seconds plays once (a page drawn twice asks twice).
 */
export function playSound(name: SoundName, key?: string) {
  if (key) {
    const now = Date.now();
    if (now - (lastPlayed.get(key) ?? 0) < 2000) return;
    lastPlayed.set(key, now);
  }
  const c = context();
  if (!c) return;
  const start = c.currentTime + 0.01;
  for (const note of SOUNDS[name]) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    const t = start + note.at;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(note.gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + note.dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t);
    osc.stop(t + note.dur + 0.02);
  }
}
