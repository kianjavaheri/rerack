import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import { isNative } from '../native/platform';

/** ios/App/App/AppScreenPlugin.swift */
const AppScreen = registerPlugin<{ keepAwake(options: { on: boolean }): Promise<void> }>('AppScreen');
/** How many open pages want the screen kept on. */
let holders = 0;

/**
 * Keeps the screen on while `active` (a live workout is open and Settings' "Keep the screen on" is on), so the phone
 * doesn't lock between sets. In the iPhone app iOS's own idle timer is turned off (AppScreenPlugin); on the web the
 * Wake Lock API, which iOS releases whenever the page is hidden, so it's taken again on return. A no-op where
 * unsupported.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (isNative) {
      // Counted: the live workout's page can be drawn twice (its route and Check in's tab slot).
      if (holders++ === 0) void AppScreen.keepAwake({ on: true }).catch(() => {});
      return () => {
        if (--holders === 0) void AppScreen.keepAwake({ on: false }).catch(() => {});
      };
    }
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        // Not allowed right now (e.g. low battery mode); the screen just locks as usual.
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);
}
