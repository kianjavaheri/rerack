import { StatusBar, Style } from '@capacitor/status-bar';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { accentOf, accentTone, accentVars, BAMBOO_PAPER, DEFAULT_ACCENT } from '../core/accents';
import { DEFAULT_SETTINGS, type Settings, type ThemePreference } from '../core/types';
import { repo } from '../data';
import { isNative } from '../native/platform';
import { registerPlugin } from '@capacitor/core';

/** ios/App/App/AppScreenPlugin.swift */
const AppScreen = registerPlugin<{ setBackground(color: { r: number; g: number; b: number }): Promise<void> }>('AppScreen');
import { useRepoQuery } from './useRepo';

interface SettingsContextValue {
  settings: Settings;
  /** The saved settings have loaded (until then `settings` is the defaults). */
  ready: boolean;
  /** The theme actually applied after resolving "system". */
  resolvedTheme: 'light' | 'dark';
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * The theme choice, also kept on this device so the very first frame (index.html's loader, before any code runs) and
 * the moments before saved settings load use it, not the phone's light/dark setting.
 */
const THEME_KEY = 'lifttrack:theme';
function storedTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'bamboo' ? value : 'system';
  } catch {
    return 'system';
  }
}

/**
 * The accent, kept on this device too: its choice for the moments before settings load, and its CSS variables for
 * both themes, which index.html applies before the first frame (the loader ring included). The keys it replaced
 * (dark-accent, mono-accent, pink-accent) are still read once, then removed.
 */
const ACCENT_KEY = 'rerack:accent';
const ACCENT_VARS_KEY = 'rerack:accent-vars';
const OLD_KEYS = ['rerack:dark-accent', 'rerack:mono-accent', 'rerack:pink-accent'];
function storedAccent(): Partial<Settings> {
  try {
    const accent = localStorage.getItem(ACCENT_KEY);
    if (accent) return { accent };
    return {
      darkAccent: localStorage.getItem(OLD_KEYS[0]) === 'purple' ? 'purple' : null,
      monoAccent: localStorage.getItem(OLD_KEYS[1]) === '1',
      pinkAccent: localStorage.getItem(OLD_KEYS[2]) === '1',
    };
  } catch {
    return {};
  }
}

let applied: string[] = [];
/** Puts an accent's colours on the page (also used live while the colour wheel is turned, before it's saved). */
export function applyAccent(accent: string, dark: boolean) {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(name);
  applied = [];
  root.classList.toggle('accent-custom', accent !== DEFAULT_ACCENT);
  if (accent === DEFAULT_ACCENT) return;
  for (const [name, value] of Object.entries(accentVars(accentTone(accent, dark)))) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const loaded = useRepoQuery((r) => r.getSettings());
  const settings = loaded ?? { ...DEFAULT_SETTINGS, theme: storedTheme(), ...storedAccent() };
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = settings.theme === 'system' ? system : settings.theme === 'dark' ? 'dark' : 'light';
  const bamboo = settings.theme === 'bamboo';

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(THEME_KEY, loaded.theme);
    } catch {
      // Private mode etc.: the first frame just follows the phone's setting.
    }
  }, [loaded?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const accent = accentOf(settings);
  useEffect(() => {
    applyAccent(accent, resolvedTheme === 'dark');
    if (!loaded) return;
    try {
      for (const key of OLD_KEYS) localStorage.removeItem(key);
      if (accent === DEFAULT_ACCENT) {
        localStorage.removeItem(ACCENT_KEY);
        localStorage.removeItem(ACCENT_VARS_KEY);
      } else {
        localStorage.setItem(ACCENT_KEY, accent);
        localStorage.setItem(
          ACCENT_VARS_KEY,
          JSON.stringify({ light: accentVars(accentTone(accent, false)), dark: accentVars(accentTone(accent, true)) }),
        );
      }
    } catch {
      // Private mode etc.: the first frame has the default colours until settings load.
    }
  }, [accent, resolvedTheme, !!loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    if (bamboo) document.documentElement.dataset.paper = 'bamboo';
    else delete document.documentElement.dataset.paper;
    if (isNative) void StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
    if (isNative) {
      // The native colour behind the page (seen when it's pulled past the top) follows the page's own.
      // --paper (the app's body; read as the variable, since the body's own colour is still fading at this point).
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      if (/^#[0-9a-f]{6}$/i.test(hex)) {
        const n = parseInt(hex.slice(1), 16);
        void AppScreen.setBackground({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }).catch(() => {});
      }
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#0f1011' : bamboo ? BAMBOO_PAPER : '#f2f1f6');
  }, [resolvedTheme, bamboo]);

  // Merged into the latest saved settings, not this render's copy (which is the defaults before the first load).
  const update = (patch: Partial<Settings>) => {
    void repo.getSettings().then((current) => repo.saveSettings({ ...current, ...patch }));
  };

  return <SettingsContext.Provider value={{ settings, ready: !!loaded, resolvedTheme, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
