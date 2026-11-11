import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { applyWatchOp, watchState, type WatchOp } from '../core/watch';
import type { Exercise, ID, Session, Settings } from '../core/types';
import { repo } from '../data';
import { useIsIsolation } from '../hooks/useCatalog';
import { useRoutines, useWorkouts } from '../hooks/useRepo';
import { isNative } from './platform';

/**
 * ios/App/App/WatchPlugin.swift, over WatchBridge.swift (WatchConnectivity). The bridge runs natively from launch, even
 * when the watch wakes the app in the background with no web view: it keeps the watch's ops in order until this side
 * has applied them, and meanwhile updates the lock screen itself.
 */
interface WatchPlugin {
  /** What the watch should show (a `WatchState` as JSON), sent as its application context. */
  updateState(options: { json: string }): Promise<void>;
  /** The watch's ops not yet applied, oldest first (each a `WatchOp` as JSON). */
  takeOps(): Promise<{ ops: string[] }>;
  /**
   * Ops up to this one are applied: dropped here. The watch is told with the next state sent (it then stops replaying
   * them over the state), so it never gets an older state that says they're in.
   */
  ackOps(options: { src: string; seq: number }): Promise<void>;
  /** The session the watch is running a workout for (it alerts rest itself then), or null. */
  status(): Promise<{ runningSessionId: string | null }>;
  /** Opens Rerack on the watch for a workout just started on the phone (the watch taps the wrist, as Hevy's does). */
  startWatchApp(): Promise<{ launched: boolean }>;
  addListener(event: 'ops' | 'status', listener: () => void): Promise<PluginListenerHandle>;
}
const Watch = registerPlugin<WatchPlugin>('Watch');

const report = (err: unknown) => console.warn('[Watch]', err);

/** The state last sent, and how to build it from the sessions (set by the hook once everything it needs has loaded). */
let lastSent = '';
let buildState: ((sessions: Session[]) => string) | null = null;

/** `force`: send even if unchanged, so the watch hears that ops were applied (one that changed nothing included). */
function sendState(json: string, force = false) {
  if (!json || (json === lastSent && !force)) return;
  lastSent = json;
  void Watch.updateState({ json }).catch(report);
}

/** Workouts started on the watch: it's open there already, so it isn't launched for them. */
const startedOnWatch = new Set<ID>();
/** The last workout the watch app was launched for (kept, so reopening the app doesn't launch it again). */
const LAUNCHED_KEY = 'rerack:watch-launched';
/** Only a workout started this recently launches the watch app (not one left open from earlier). */
const LAUNCH_WITHIN_MS = 2 * 60_000;

/** Applies the watch's queued ops one at a time, in order; called again while it runs, it goes round once more. */
let applying = false;
let again = false;
async function applyOps() {
  if (applying) {
    again = true;
    return;
  }
  applying = true;
  let applied = false;
  try {
    do {
      again = false;
      const { ops } = await Watch.takeOps();
      for (const raw of ops) {
        let op: WatchOp;
        try {
          op = JSON.parse(raw) as WatchOp;
        } catch {
          continue;
        }
        if (op.kind === 'start') startedOnWatch.add(op.sessionId);
        const result = applyWatchOp(await repo.getSession(op.sessionId), op);
        if (result && 'save' in result) await repo.saveSession(result.save);
        else if (result && 'delete' in result) await repo.deleteSession(result.delete);
        await Watch.ackOps({ src: op.src, seq: op.seq });
        applied = true;
      }
    } while (again);
    // Straight back to the watch, read fresh (not waiting for the page to redraw with the new data).
    if (applied && buildState) sendState(buildState(await repo.listSessions()), true);
  } catch (err) {
    report(err);
  } finally {
    applying = false;
  }
}

/**
 * In the iPhone app, keeps the Apple Watch app in step (mounted once in Layout): applies what was logged on the watch
 * (once the sessions have loaded, so the workout it changes is there), and sends the watch the open workout and the
 * workouts it can start whenever they change. Returns the session the watch is running a workout for: the phone
 * leaves rest alerts to the watch then, so they don't buzz twice.
 */
export function useAppleWatch(
  sessions: Session[] | undefined,
  exercises: Exercise[] | undefined,
  settings: Settings,
  pictureOf: (exerciseId: ID) => string | undefined,
): string | null {
  const workouts = useWorkouts();
  const routines = useRoutines();
  // The library (for compound/isolation rest lengths) only loads in the iPhone app.
  const isIsolation = useIsIsolation(isNative);
  const [running, setRunning] = useState<string | null>(null);
  const loaded = !!sessions;

  useEffect(() => {
    if (!isNative || !loaded) return;
    const handles: Promise<PluginListenerHandle>[] = [];
    const refreshStatus = () => void Watch.status().then((s) => setRunning(s.runningSessionId), report);
    handles.push(Watch.addListener('ops', () => void applyOps()));
    handles.push(Watch.addListener('status', refreshStatus));
    // Ops that came in while the app was closed or asleep.
    void applyOps();
    refreshStatus();
    const onVisible = () => document.visibilityState === 'visible' && void applyOps();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      handles.forEach((h) => void h.then((x) => x.remove()));
    };
  }, [loaded]);

  const ready = isNative && !!sessions && !!exercises && !!workouts && !!routines;
  const build = (list: Session[]) =>
    ready ? JSON.stringify(watchState({ sessions: list, exercises, workouts, routines, settings, isIsolation, pictureOf })) : '';
  const json = ready ? build(sessions) : '';
  const latest = useRef(build);
  useEffect(() => {
    latest.current = build;
  });
  useEffect(() => {
    if (!ready) return;
    buildState = (list) => latest.current(list);
    return () => {
      buildState = null;
    };
  }, [ready]);
  useEffect(() => sendState(json), [json]);

  // A workout just started on the phone opens on the watch too. Sent after its state (above), so the watch has the
  // workout moments after it opens.
  const open = sessions?.find((s) => !s.finishedAt && s.live !== false);
  const launchFor = open && Date.now() - Date.parse(open.startedAt) < LAUNCH_WITHIN_MS ? open.id : null;
  useEffect(() => {
    if (!isNative || !launchFor || startedOnWatch.has(launchFor)) return;
    try {
      if (localStorage.getItem(LAUNCHED_KEY) === launchFor) return;
      localStorage.setItem(LAUNCHED_KEY, launchFor);
    } catch {
      // Not remembered: at worst it's launched again on the next start of the app.
    }
    void Watch.startWatchApp().catch(report);
  }, [launchFor]);

  return running;
}
