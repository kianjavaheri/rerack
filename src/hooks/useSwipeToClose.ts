import { useEffect, type RefObject } from 'react';

const CLOSE_DISTANCE = 110;
const CLOSE_SPEED = 0.6; // px per ms
/** Pulled up this far (or flicked up), an expandable sheet grows to nearly the full screen. */
const EXPAND_DISTANCE = 60;
const EXPAND_MS = 380;
/** A pull counts once it's this far down. */
const START_PX = 6;

/** A touch here is for the control: moving a slider, scrolling a text box or a list of options. */
const KEEP_TOUCH = 'textarea, select, input[type="range"]';

/**
 * Swipe a sheet down to close it, from anywhere on it as long as what's under the finger is scrolled to its top (else
 * the swipe scrolls that, like an iOS sheet). It follows the finger; let go far or fast enough and it slides away, else
 * it goes back. Touch only.
 *
 * With `expandable`, a sheet that sits at the bottom of a phone screen can also be pulled up to nearly the full screen
 * (`.expanded`), like an iOS sheet's large detent; it stays there, and a pull down from there closes it.
 */
export function useSwipeToClose(sheetRef: RefObject<HTMLElement | null>, onClose: () => void, expandable = false) {
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const overlay = sheet.parentElement;
    let tracking = false;
    let dragging = false;
    /** This touch pulls the sheet up (to expand it) rather than down. */
    let raising = false;
    let startHeight = 0;
    let fullHeight = 0;
    const phone = window.matchMedia('(max-width: 820px)');
    const canExpand = () => expandable && phone.matches && !sheet.classList.contains('expanded');
    /** The sheet's height when expanded (from its CSS), measured without showing it. */
    const expandedHeight = () => {
      const { height, transition } = sheet.style;
      sheet.style.transition = 'none';
      sheet.style.height = '';
      sheet.classList.add('expanded');
      const h = sheet.getBoundingClientRect().height;
      sheet.classList.remove('expanded');
      sheet.style.height = height;
      void sheet.offsetHeight;
      sheet.style.transition = transition;
      return h;
    };
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastAt = 0;
    let speed = 0;

    const scrolledBelowTop = (from: Element) => {
      for (let el: Element | null = from; el && el !== sheet.parentElement; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    };

    const place = (y: number, animate: boolean) => {
      sheet.style.transition = animate ? 'transform 0.26s var(--ease)' : 'none';
      sheet.style.transform = y ? `translateY(${y}px)` : '';
      // The dimming lifts as the sheet goes.
      if (overlay) {
        overlay.style.transition = animate ? 'background-color 0.26s var(--ease)' : 'none';
        overlay.style.backgroundColor = y ? `rgb(0 0 0 / ${0.32 * Math.max(0, 1 - y / sheet.offsetHeight)})` : '';
      }
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return;
      const target = e.target as Element;
      if (target.closest(KEEP_TOUCH)) return;
      // Scrolled down, the touch scrolls the list, unless it can still raise the sheet.
      if (scrolledBelowTop(target) && !canExpand()) return;
      const t = e.touches[0];
      tracking = true;
      dragging = false;
      raising = false;
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastAt = e.timeStamp;
      speed = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - startX);
      const dy = t.clientY - startY;
      if (!dragging && dy < 0 && dx <= Math.abs(dy) && canExpand()) {
        // Up on a sheet that can grow: it grows first, then its list scrolls (once expanded).
        if (e.cancelable) e.preventDefault();
        if (-dy < START_PX) return;
        dragging = true;
        raising = true;
        sheet.style.animation = 'none';
        startHeight = sheet.getBoundingClientRect().height;
        fullHeight = expandedHeight();
        sheet.style.maxHeight = 'none';
        sheet.style.transition = 'none';
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      if (raising) {
        if (e.cancelable) e.preventDefault();
        const dt = e.timeStamp - lastAt;
        if (dt > 0) speed = (t.clientY - lastY) / dt;
        lastY = t.clientY;
        lastAt = e.timeStamp;
        const up = Math.max(0, startY - t.clientY - START_PX);
        // Follows the finger up to full height, then resists.
        const h = startHeight + up;
        sheet.style.height = `${h <= fullHeight ? h : fullHeight + (h - fullHeight) * 0.15}px`;
        return;
      }
      if (!dragging) {
        // Up, or more sideways than down, belongs to whatever's underneath (a list scrolling, a row of chips).
        if (dy < 0 || dx > Math.abs(dy)) {
          if (dx > 3 || dy < -3) tracking = false;
          return;
        }
        if (scrolledBelowTop(e.target as Element)) {
          tracking = false;
          return;
        }
        // iOS settles on scrolling at a touch's first move, so that has to be claimed before it's a real pull.
        if (e.cancelable) e.preventDefault();
        if (dy < START_PX) return;
        dragging = true;
        sheet.style.animation = 'none';
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - lastAt;
      if (dt > 0) speed = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastAt = e.timeStamp;
      place(Math.max(0, dy - START_PX), false);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      if (raising) {
        raising = false;
        const up = startY - lastY;
        const expand = up > EXPAND_DISTANCE || (speed < -CLOSE_SPEED && up > 20);
        sheet.style.transition = `height ${EXPAND_MS}ms var(--ease-swipe)`;
        sheet.style.height = `${expand ? fullHeight : startHeight}px`;
        setTimeout(() => {
          sheet.style.transition = '';
          sheet.style.height = '';
          sheet.style.maxHeight = '';
          if (expand) sheet.classList.add('expanded');
        }, EXPAND_MS);
        return;
      }
      const pulled = lastY - startY;
      if (pulled > CLOSE_DISTANCE || (speed > CLOSE_SPEED && pulled > 24)) {
        place(window.innerHeight, true);
        setTimeout(onClose, 200);
      } else {
        place(0, true);
      }
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
    // onClose is read fresh through the caller's ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
