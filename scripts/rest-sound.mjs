// Writes the "rest over" sound (ios/App/App/rest-over.caf): two soft rising notes, about half a second, so it's
// noticed in earbuds without being jarring. Run: node scripts/rest-sound.mjs (needs macOS's afconvert).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RATE = 44100;
const LENGTH = 0.55; // seconds
const notes = [
  { at: 0, freq: 880 }, // A5
  { at: 0.13, freq: 1318.5 }, // E6
];
const samples = new Float32Array(Math.round(RATE * LENGTH));
for (const { at, freq } of notes) {
  const start = Math.round(at * RATE);
  for (let i = start; i < samples.length; i++) {
    const t = (i - start) / RATE;
    const attack = Math.min(1, t / 0.006); // no click
    const decay = Math.exp(-t / 0.11);
    // A little of the octave above makes it a chime rather than a beep.
    const tone = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 2 * t);
    samples[i] += 0.32 * attack * decay * tone;
  }
}
// Fade the last 30 ms to silence.
const fade = Math.round(0.03 * RATE);
for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] *= i / fade;

const data = Buffer.alloc(samples.length * 2);
samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const wav = join(mkdtempSync(join(tmpdir(), 'rest-sound-')), 'rest-over.wav');
writeFileSync(wav, Buffer.concat([header, data]));
const out = new URL('../ios/App/App/rest-over.caf', import.meta.url).pathname;
execFileSync('afconvert', ['-f', 'caff', '-d', 'LEI16@44100', wav, out]);
console.log(`Wrote ${out}`);
