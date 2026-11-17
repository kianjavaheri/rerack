/**
 * Stops the page scrolling behind a dialog, menu or window; returns the release. Counted, so overlapping ones (a menu
 * opening a sheet, a summary opened while a sheet is up) never leave the page locked: each one saving and restoring
 * `body.style.overflow` restored "hidden" once and the page stopped scrolling until it reloaded.
 */
let holders = 0;

export function lockScroll(): () => void {
  holders++;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.style.overflow = '';
  };
}
