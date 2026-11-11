import { Minus, Pause, Play, Plus, Square, Timer } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How long "Rest over" stays up before the bar goes away by itself. */
const DONE_SHOWN_MS = 15_000;

export const formatRest = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Whether the bar shows: a rest under way, paused, or over less than 15 s ago. */
export function restShown(endsAt: string | null | undefined, pausedLeft: number | null | undefined, now = Date.now()) {
  if (pausedLeft != null) return true;
  return !!endsAt && Date.parse(endsAt) + DONE_SHOWN_MS > now;
}

interface RestTimerProps {
  endsAt: string | null;
  /** Seconds left when it was paused; null while it runs. */
  pausedLeft: number | null;
  /** Length Again uses, e.g. "2:00". */
  startLabel: string;
  onStart: () => void;
  /** Ends the rest; the bar goes away. */
  onStop: () => void;
  onAdjust: (seconds: number) => void;
  onPause: () => void;
  onResume: () => void;
  /** Over for a while: the bar goes away by itself (the page stops drawing it). */
  onGone: () => void;
}

/**
 * Rest bar for a live workout. Only there while resting: checking off a set brings it in under Back, pinned to the top
 * of the screen once scrolled to it (then edge to edge, attached to the top, so nothing scrolls above it to mis-tap).
 * Running it counts down with −15 s / +15 s, Pause and Stop; paused it shows the time left and Resume; when it ends
 * it turns rainbow with Again for a few seconds, then goes away. Stop ends it and it goes away.
 *
 * Coming in or going while the page is scrolled down, the page scrolls by the bar's height so what's on screen stays
 * still (the bar would otherwise push the set just checked off down, or pull it up).
 */
export function RestTimer({ endsAt, pausedLeft, startLabel, onStart, onStop, onAdjust, onPause, onResume, onGone }: RestTimerProps) {
  // Stuck to the top of the screen (scrolled past its place under Back): drawn attached to the top edge.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const check = () => {
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      setStuck(bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0);
    };
    check();
    // Coming in it slides up a few pixels, so look again once it has landed.
    bar.addEventListener('animationend', check);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      bar.removeEventListener('animationend', check);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Keep the page still as the bar comes in and goes (only when its place is above the screen's top).
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const size = () => bar.offsetHeight + parseFloat(getComputedStyle(bar).marginBottom || '0');
    const above = () => bar.parentElement!.getBoundingClientRect().top + window.scrollY + bar.offsetTop < window.scrollY;
    const height = size();
    if (window.scrollY > 0 && above()) window.scrollBy(0, height);
    return () => {
      // Read before it's removed, scroll back once it is.
      if (window.scrollY > 0 && above()) queueMicrotask(() => window.scrollBy(0, -height));
    };
  }, []);

  // Ticks while running or just over; the time itself is read when drawing, so a rest that was just started shows its
  // full length at once rather than counting from when the last tick happened.
  const [, setTick] = useState(0);
  const onGoneRef = useRef(onGone);
  useLayoutEffect(() => {
    onGoneRef.current = onGone;
  });
  useEffect(() => {
    if (!endsAt || pausedLeft != null) return;
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      if (!restShown(endsAt, null)) {
        clearInterval(timer);
        onGoneRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [endsAt, pausedLeft]);

  const paused = pausedLeft != null;
  const left = paused ? pausedLeft : endsAt ? Math.ceil((Date.parse(endsAt) - Date.now()) / 1000) : 0;
  const state = paused ? 'paused' : left <= 0 ? 'over' : 'running';

  return (
    <div ref={barRef} className={`rest-timer ${state}${stuck ? ' stuck' : ''}`} role="timer" aria-live={state === 'over' ? 'assertive' : 'off'}>
      <span className="rest-label tnum">
        <Timer size={16} />
        {state === 'over' ? 'Rest over' : `${paused ? 'Paused' : 'Rest'} ${formatRest(Math.max(0, left))}`}
      </span>
      <span className="row" style={{ gap: 6 }}>
        {state !== 'over' && (
          <>
            <button className="rest-btn" onClick={() => onAdjust(-15)} aria-label="15 seconds less">
              <Minus size={14} />
              15
            </button>
            <button className="rest-btn" onClick={() => onAdjust(15)} aria-label="15 seconds more">
              <Plus size={14} />
              15
            </button>
            {paused ? (
              <button className="rest-btn" onClick={onResume} aria-label="Resume the rest" title="Resume">
                <Play size={13} fill="currentColor" />
              </button>
            ) : (
              <button className="rest-btn" onClick={onPause} aria-label="Pause the rest" title="Pause">
                <Pause size={13} fill="currentColor" />
              </button>
            )}
          </>
        )}
        {state === 'over' && (
          <button className="rest-btn" onClick={onStart} aria-label={`Start another ${startLabel} rest`}>
            <Play size={13} /> Again
          </button>
        )}
        <button className="rest-btn stop" onClick={onStop} aria-label="Stop the rest" title="Stop">
          <Square size={12} fill="currentColor" />
        </button>
      </span>
    </div>
  );
}
