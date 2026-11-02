import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../utils/haptics';

/**
 * An exercise just finished: a rainbow circle pops up mid-screen, its check draws itself and a ring ripples out, with
 * a firm tap and a lighter one, then it fades (under a second). It never blocks a tap. Re-key it to play it again.
 */
export function DoneBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    haptic(undefined, 'heavy');
    const second = setTimeout(() => haptic(undefined, 'light'), 140);
    const end = setTimeout(onDone, 950);
    return () => {
      clearTimeout(second);
      clearTimeout(end);
    };
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="done-burst" aria-hidden>
      <span className="done-burst-ring" />
      <span className="done-burst-circle">
        <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" pathLength={1} />
        </svg>
      </span>
    </div>,
    document.body,
  );
}
