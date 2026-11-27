import type { Settings } from './types';

/**
 * The app's accent in one theme: the roles index.css reads (see its "Rainbow" section). `rb` are the fills (with `on`
 * text on top), `ink` text and icons (deeper in light mode, lighter in dark, so they read on the page), `accent` the
 * one solid colour for what can't take a gradient and `fill` its fill version.
 */
export interface AccentTone {
  accent: string;
  fill: string;
  rb: string[];
  ink: string[];
  on: string;
}

export interface AccentPreset {
  id: string;
  name: string;
  light: AccentTone;
  dark: AccentTone;
}

const same = (c: string, on: string): AccentTone => ({ accent: c, fill: c, rb: Array(6).fill(c), ink: Array(6).fill(c), on });

/** The premade accents (Settings → Appearance). The first is the default, also index.css's own values. */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    light: {
      accent: '#2563cf', fill: '#4aa8f2',
      rb: ['#6f7cff', '#5a93f7', '#4aa8f2', '#43bbed', '#4fc4ef', '#3b9cf0'],
      ink: ['#3d4ad0', '#2563cf', '#1a78c4', '#1488bb', '#158fb6', '#1d6fd1'],
      on: '#17122b',
    },
    dark: {
      accent: '#e8635c', fill: '#e8635c',
      rb: ['#ed7543', '#ee8a56', '#ec7c6e', '#e8635c', '#e24b4f', '#d93a45'],
      ink: ['#f58a5c', '#f59a6a', '#f28f82', '#f27870', '#ef6266', '#ea5560'],
      on: '#17122b',
    },
  },
  {
    id: 'purple',
    name: 'Purple',
    light: {
      accent: '#7c3aed', fill: '#8b5cf6',
      rb: ['#c05cf0', '#a855f7', '#9b5cf6', '#8b5cf6', '#7c6cf6', '#6878f2'],
      ink: ['#a32fd1', '#9333ea', '#8030df', '#7c3aed', '#6d3fe0', '#5b48d6'],
      on: '#fff',
    },
    dark: {
      accent: '#b06cff', fill: '#b06cff',
      rb: ['#ea74fc', '#d66cff', '#c168ff', '#a870ff', '#8c78ff', '#6e81ff'],
      ink: ['#f08afd', '#dd84ff', '#cc82ff', '#b688ff', '#9d8eff', '#8697ff'],
      on: '#17122b',
    },
  },
  {
    id: 'pink',
    name: 'Pink',
    light: {
      accent: '#d62f7c', fill: '#e24489',
      rb: ['#f0609e', '#ea4f93', '#e24489', '#d93a80', '#cf3177', '#c42a6e'],
      ink: ['#d1307c', '#c92a75', '#c1256e', '#b72067', '#ad1c60', '#a3185a'],
      on: '#fff',
    },
    dark: {
      accent: '#ff8cc0', fill: '#ff8cc0',
      rb: ['#ffb3d6', '#ffa3cc', '#ff94c2', '#fb86b9', '#f57ab0', '#ef6fa8'],
      ink: ['#ffbfdc', '#ffb0d3', '#ffa2ca', '#fc94c1', '#f888b8', '#f37db0'],
      on: '#2a0f1c',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    light: {
      accent: '#0e6f98', fill: '#1e98c2',
      rb: ['#2bb3a3', '#22a6b3', '#1e98c2', '#2a87cf', '#3577d6', '#3f68db'],
      ink: ['#0f8173', '#0d7c88', '#0e6f98', '#1763a8', '#1f57b3', '#2a4cb8'],
      on: '#fff',
    },
    dark: {
      accent: '#5fcbee', fill: '#4cc3ea',
      rb: ['#5ee0cf', '#4fd3dc', '#4cc3ea', '#58b0f2', '#669ef5', '#738ef7'],
      ink: ['#6fe6d6', '#62dae2', '#5fcbee', '#6bbaf4', '#79aaf6', '#859bf8'],
      on: '#06222a',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    light: {
      accent: '#237344', fill: '#3fa667',
      rb: ['#6cc04a', '#52b35a', '#3fa667', '#2f9970', '#278c74', '#217f74'],
      ink: ['#3f8a25', '#2f7f37', '#237344', '#1b6a4d', '#166150', '#125852'],
      on: '#fff',
    },
    dark: {
      accent: '#78d486', fill: '#78d486',
      rb: ['#a6e36f', '#8fdc79', '#78d486', '#64cb92', '#55c19b', '#4ab6a0'],
      ink: ['#b2e884', '#9de28d', '#88db98', '#76d3a2', '#69caaa', '#5fc0ae'],
      on: '#0d2412',
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    light: {
      accent: '#a35a00', fill: '#eda23a',
      rb: ['#f2b33d', '#eda23a', '#e78f36', '#e07b33', '#d86a31', '#ce5a2f'],
      ink: ['#b26a00', '#a86100', '#9e5800', '#944f00', '#8a4700', '#803f00'],
      on: '#2a1600',
    },
    dark: {
      accent: '#ffbe6c', fill: '#ffb45a',
      rb: ['#ffd36e', '#ffc463', '#ffb45a', '#fca352', '#f7924b', '#f08245'],
      ink: ['#ffdb85', '#ffcd78', '#ffbe6c', '#fdae62', '#f99f5a', '#f39053'],
      on: '#2a1600',
    },
  },
  { id: 'mono', name: 'Mono', light: same('#111113', '#fff'), dark: same('#f4f4f5', '#111113') },
];

export const DEFAULT_ACCENT = 'classic';

/** A custom accent is stored as its colour ("#3fa9f5"); anything else is a preset's id. */
export const isCustomAccent = (accent: string) => /^#[0-9a-f]{6}$/i.test(accent);

/** The accent chosen: `Settings.accent`, else the switches it replaced (purple, black and white, pink). */
export function accentOf(settings: Settings): string {
  if (settings.accent && (isCustomAccent(settings.accent) || ACCENT_PRESETS.some((p) => p.id === settings.accent))) return settings.accent;
  if (settings.monoAccent) return 'mono';
  if (settings.pinkAccent) return 'pink';
  if (settings.darkAccent === 'purple') return 'purple';
  return DEFAULT_ACCENT;
}

// ---- Colour maths for a custom accent ----

type Hsl = [h: number, s: number, l: number];

function toHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (k: number) => {
    const n = (k + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(n - 3, 9 - n, 1));
  };
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}

/** Relative luminance (WCAG), 0 to 1. */
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A sweep from one colour: its neighbours on the colour wheel a little either side, so it still bleeds like the
 * premade ones. Fills keep the colour's own lightness within reason (a near-white or near-black pick would vanish into
 * the page); text and icons are pushed far enough from the page to read: deeper in light mode, lighter in dark.
 */
function customTone(hex: string, dark: boolean): AccentTone {
  const [h, s, l] = toHsl(hex);
  const fillL = dark ? clamp(l, 0.45, 0.8) : clamp(l, 0.3, 0.66);
  const inkL = dark ? Math.max(l, 0.68) : Math.min(l, 0.42);
  const rb = Array.from({ length: 6 }, (_, i) => fromHsl(h - 14 + i * 5.6, s, clamp(fillL + 0.05 - i * 0.02, 0, 1)));
  const ink = Array.from({ length: 6 }, (_, i) => fromHsl(h - 14 + i * 5.6, s, clamp(inkL + 0.04 - i * 0.016, 0, 1)));
  const on = luminance(rb[2]) > 0.4 ? '#111113' : '#fff';
  return { accent: ink[2], fill: rb[2], rb, ink, on };
}

/** The accent's colours in a theme, premade or worked out from a custom colour. */
export function accentTone(accent: string, dark: boolean): AccentTone {
  if (isCustomAccent(accent)) return customTone(accent, dark);
  const preset = ACCENT_PRESETS.find((p) => p.id === accent) ?? ACCENT_PRESETS[0];
  return dark ? preset.dark : preset.light;
}

/** The CSS custom properties for a tone, as index.css names them. */
export function accentVars(tone: AccentTone): Record<string, string> {
  const vars: Record<string, string> = {
    '--accent': tone.accent,
    '--accent-soft': tone.accent + '24',
    '--accent-fill': tone.fill,
    '--on-rainbow': tone.on,
    '--on-accent': luminance(tone.accent) > 0.4 ? '#111113' : '#fff',
  };
  tone.rb.forEach((c, i) => (vars[`--rb-${i + 1}`] = c));
  tone.ink.forEach((c, i) => (vars[`--ink-${i + 1}`] = c));
  return vars;
}

/** For the lock screen, widget and watch (Swift `AccentTone`): four colours of the sweep, one solid, text on it. */
export interface NativeTone {
  sweep: string[];
  accent: string;
  on: string;
}
export interface NativeAccent {
  light: NativeTone;
  dark: NativeTone;
  /** The light theme's page colour when it isn't plain (Bamboo), so the light widget matches it. */
  paper?: string;
}

const nativeTone = (t: AccentTone): NativeTone => ({ sweep: [t.ink[0], t.ink[2], t.ink[4], t.ink[5]], accent: t.ink[3], on: t.on });

export const BAMBOO_PAPER = '#f3eedf';

export function nativeAccent(settings: Settings): NativeAccent {
  const accent = accentOf(settings);
  return {
    light: nativeTone(accentTone(accent, false)),
    dark: nativeTone(accentTone(accent, true)),
    ...(settings.theme === 'bamboo' ? { paper: BAMBOO_PAPER } : {}),
  };
}
