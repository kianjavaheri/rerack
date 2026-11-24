// Keeps what you're typing in above the on-screen keyboard on iPhones.
//
// iOS doesn't shrink the page for the keyboard: it shrinks the *visual* viewport and leaves fixed elements attached to
// the full-height layout viewport, so a sheet pinned to the bottom of the screen (a dialog with a text field that
// focuses as it opens) ends up behind the keyboard. Only a later tap, which makes iOS scroll to the field, fixed it.
//
// So the visible area is published as CSS variables (--vv-top, --vv-height) that dialog overlays size themselves to,
// html gets .keyboard-open while the keyboard is up, and a focused field that's still covered is scrolled into view.

const KEYBOARD_MIN_PX = 120;
const VIEWPORT_SETTLE_MS = 160;

export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;

  const update = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    const open = window.innerHeight - vv.height > KEYBOARD_MIN_PX;
    root.classList.toggle('keyboard-open', open);
    if (open) revealSoon();
  };

  let timer = 0;
  const revealSoon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(revealFocused, VIEWPORT_SETTLE_MS);
  };
  const revealFocused = () => {
    const field = document.activeElement;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || (field as HTMLElement | null)?.isContentEditable)) return;
    if ((field as HTMLElement).dataset.keyboardProxy != null) return;
    const box = (field as HTMLElement).getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    if (box.bottom > visibleBottom - 12) window.scrollBy({ top: box.bottom - visibleBottom + 24, behavior: 'smooth' });
    else if (box.top < vv.offsetTop) window.scrollBy({ top: box.top - vv.offsetTop - 24, behavior: 'smooth' });
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  // A field focused while the keyboard is already up (moving between fields) doesn't resize the viewport.
  document.addEventListener('focusin', () => root.classList.contains('keyboard-open') && revealSoon());
  update();
}

/**
 * Brings the keyboard up from a tap that's about to show a text field. iOS only opens the keyboard for a focus made
 * during the tap itself, and the field (a note pad) is drawn a moment later, so its own focus came too late: you had to
 * tap it again. So this focuses an invisible field where the tap was, at once; the real one takes the focus when it
 * mounts (`autoFocus`) and the keyboard stays up. Call it in the click handler, before the state change.
 */
export function primeKeyboard(at: HTMLElement) {
  const box = at.getBoundingClientRect();
  const proxy = document.createElement('input');
  proxy.dataset.keyboardProxy = '';
  proxy.setAttribute('aria-hidden', 'true');
  proxy.tabIndex = -1;
  // At the tap, so iOS has nothing to scroll to; 16px so it doesn't zoom.
  proxy.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:1px;height:${box.height}px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none;`;
  document.body.appendChild(proxy);
  proxy.focus({ preventScroll: true });
  const remove = () => proxy.remove();
  proxy.addEventListener('blur', remove, { once: true });
  setTimeout(() => {
    if (document.activeElement === proxy) proxy.blur();
    remove();
  }, 1000);
}
