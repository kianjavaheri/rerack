import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A row of pages (weeks, months) that scrolls sideways one at a time, oldest on the left, opening on the newest (the
 * last). `index` is the page in view; `go(i)` scrolls to one (the arrows beside the title). The scroller is a plain
 * overflow-x element with scroll snapping, so tab swipes leave it alone (useTabSwipe skips sideways scrollers).
 * It goes back to the newest whenever the number of pages changes (a new week or month began) or `resetKey` does (a
 * different set of pages, like weeks instead of months).
 */
export function usePager(count: number, resetKey?: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const reset = `${count}|${String(resetKey)}`;
  const [state, setState] = useState({ reset, index: count - 1 });
  let index = state.index;
  if (state.reset !== reset) {
    index = count - 1;
    setState({ reset, index });
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [reset]);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (i !== index) setState({ reset, index: i });
  };
  const go = (i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(count - 1, i)) * el.clientWidth, behavior: 'smooth' });
  };
  return { ref, index, onScroll, go };
}
