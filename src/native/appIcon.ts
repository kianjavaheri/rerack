import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import { appIconFor } from '../core/appIcon';
import type { Settings } from '../core/types';
import { isNative } from './platform';

/** ios/App/App/AppScreenPlugin.swift */
const AppScreen = registerPlugin<{ setIcon(options: { name: string | null }): Promise<{ changed: boolean }> }>('AppScreen');

/**
 * Keeps the iPhone app's icon matching the accent and theme when "Match the app icon" is on (`appIconFor`). It waits
 * until you've left Settings (and the intro), so trying accents one after another doesn't bring up iOS's "You have
 * changed the icon" notice for each.
 */
export function useAppIcon(settings: Settings, ready: boolean, pathname: string) {
  const name = appIconFor(settings);
  const choosing = pathname.startsWith('/settings') || settings.introDone === false;
  useEffect(() => {
    if (!isNative || !ready || choosing) return;
    void AppScreen.setIcon({ name }).catch((err) => console.warn('App icon:', err));
  }, [name, ready, choosing]);
}
