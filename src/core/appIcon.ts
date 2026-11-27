import { accentOf, isCustomAccent } from './accents.ts';
import type { Settings } from './types.ts';

/** The tiles an accent icon comes on: the app's themes. */
export const ICON_THEMES = ['dark', 'light', 'bamboo'] as const;
export type IconTheme = (typeof ICON_THEMES)[number];

/**
 * The alternate icon's name for a premade accent on a tile (an `AppIcon-….appiconset` written by
 * scripts/ios-accent-icons.mjs), or null for the primary icon, which is Mono on dark (the white mark on black).
 */
export function iconName(accent: string, theme: IconTheme): string | null {
  return accent === 'mono' && theme === 'dark' ? null : `AppIcon-${accent}-${theme}`;
}

/**
 * The iPhone app icon these settings call for (Settings → Appearance → "Match the app icon"): the accent on the
 * theme's tile. A custom colour has no icon of its own, so it gets Mono's (white on dark, black on light). "System"
 * counts as dark: following the phone's light and dark would change the icon (and iOS's notice about it) at every
 * switch. Off: the primary icon.
 */
export function appIconFor(settings: Settings): string | null {
  if (!settings.appIconMatches) return null;
  const accent = accentOf(settings);
  const theme: IconTheme = settings.theme === 'light' ? 'light' : settings.theme === 'bamboo' ? 'bamboo' : 'dark';
  return iconName(isCustomAccent(accent) ? 'mono' : accent, theme);
}
