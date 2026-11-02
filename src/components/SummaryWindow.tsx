import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { formatDateLong } from '../core/format';
import { workoutSummary } from '../core/summary';
import type { ID } from '../core/types';
import { useSettings } from '../hooks/settings';
import { useExercises, useSessions } from '../hooks/useRepo';
import { haptic } from '../utils/haptics';
import { WorkoutSummary } from './WorkoutSummary';

// Which workout's summary is open, from anywhere: Finish opens it (celebrating) as the page turns into the finished
// workout, and the summary card on a finished workout opens it again. Rendered once, in Layout, so it doesn't depend on
// which copy of the session page is mounted.
let shown: { sessionId: ID; celebrate: boolean } | null = null;
const listeners = new Set<() => void>();
const set = (next: typeof shown) => {
  shown = next;
  listeners.forEach((l) => l());
};

export const openWorkoutSummary = (sessionId: ID, celebrate = false) => set({ sessionId, celebrate });

/**
 * A finished workout's summary as a page of its own over the app: right after Finish with the celebration (a rainbow
 * check that pops and draws itself, rings and sparks, and haptic taps), or later from the workout's summary card. Its
 * × (or Done) closes it, leaving the finished workout underneath as it is.
 */
export function SummaryWindow() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => shown,
  );
  if (!current) return null;
  return <SummaryPage key={`${current.sessionId}-${current.celebrate}`} sessionId={current.sessionId} celebrate={current.celebrate} />;
}

function SummaryPage({ sessionId, celebrate }: { sessionId: ID; celebrate: boolean }) {
  const sessions = useSessions();
  const exercises = useExercises();
  const { settings } = useSettings();
  const session = sessions?.find((s) => s.id === sessionId);
  const close = () => set(null);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // A firm tap as the check lands, then two lighter ones with the rings.
  useEffect(() => {
    if (!celebrate) return;
    const taps = [
      setTimeout(() => haptic(undefined, 'heavy'), 120),
      setTimeout(() => haptic(undefined, 'medium'), 300),
      setTimeout(() => haptic(undefined, 'light'), 460),
    ];
    return () => taps.forEach(clearTimeout);
  }, [celebrate]);

  if (sessions && !session) return null;
  const exerciseById = new Map(exercises?.map((e) => [e.id, e]));

  return createPortal(
    <div className="intro summary-window" role="dialog" aria-modal="true" aria-label="Workout summary" data-no-swipe>
      <div className="intro-panel">
        <div className="intro-top">
          <span />
          <button className="icon-btn" onClick={close} aria-label="Close summary">
            <X size={20} />
          </button>
        </div>
        <div className="intro-body">
          {session && (
            <>
              <div className={`summary-hero${celebrate ? ' celebrate' : ''}`}>
                <div className="summary-mark" aria-hidden>
                  {celebrate && (
                    <>
                      <span className="done-burst-ring" />
                      <span className="done-burst-ring late" />
                      {Array.from({ length: 12 }, (_, i) => (
                        <span key={i} className="summary-spark" style={{ '--a': `${i * 30}deg` } as React.CSSProperties} />
                      ))}
                    </>
                  )}
                  <span className="summary-check">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" pathLength={1} />
                    </svg>
                  </span>
                </div>
                {celebrate && <div className="summary-kicker">Workout done</div>}
                <h1 className="title summary-title">{session.name}</h1>
                <div className="muted">{formatDateLong(session.startedAt)}</div>
              </div>
              <WorkoutSummary summary={workoutSummary(session, sessions ?? [])} exerciseById={exerciseById} unit={settings.unit} page />
            </>
          )}
        </div>
        <div className="intro-foot">
          <span />
          <button className="btn btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
