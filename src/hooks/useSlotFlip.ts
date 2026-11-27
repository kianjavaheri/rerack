import { useLayoutEffect, useRef } from 'react';
import { SLIDE } from './useDragReorder';

/**
 * Animates exercises to their new places when a change moves them (into or out of a superset): call the returned
 * `capture()` just before the change; on the next render every element with `data-slot-id` slides from where it was.
 * By id rather than element, because moving into or out of a superset draws the card again in another list.
 * `capture(id)` also follows that card: if it lands above the screen (checking off the bottom exercise moved it up
 * the list), the page scrolls to it, clear of the status bar strip and the sticky rest bar.
 */
export function useSlotFlip() {
  const before = useRef<Map<string, number> | null>(null);
  const follow = useRef<string | null>(null);

  useLayoutEffect(() => {
    const tops = before.current;
    if (!tops) return;
    before.current = null;
    const followId = follow.current;
    follow.current = null;
    let scrollTo: number | null = null;
    if (followId) {
      const el = document.querySelector<HTMLElement>(`[data-slot-id="${CSS.escape(followId)}"]`);
      if (el) {
        const covered = Math.max(
          0,
          ...[...document.querySelectorAll<HTMLElement>('.statusbar-scrim, .nav, .rest-timer')]
            .filter((c) => !c.closest('.swipe-peek'))
            .map((c) => c.getBoundingClientRect().bottom),
        );
        const top = el.getBoundingClientRect().top;
        if (top < covered + 8) scrollTo = window.scrollY + top - covered - 12;
      }
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-slot-id]')) {
      const was = tops.get(el.dataset.slotId ?? '');
      if (was == null) continue;
      const delta = was - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${delta}px, 0)`;
      void el.offsetHeight;
      el.style.transition = `transform ${SLIDE}`;
      el.style.transform = '';
      el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true });
    }
    if (scrollTo != null) window.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
  });

  return (followId?: string) => {
    follow.current = followId ?? null;
    before.current = new Map(
      [...document.querySelectorAll<HTMLElement>('[data-slot-id]')].map((el) => [el.dataset.slotId ?? '', el.getBoundingClientRect().top]),
    );
  };
}
