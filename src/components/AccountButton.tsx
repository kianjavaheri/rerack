import { Settings } from 'lucide-react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAccountUser } from '../hooks/useAccount';
import { Avatar } from './Avatar';

/**
 * In the app, your account at the top right of each tab page, like Apple TV and HBO Max: a glass circle with your
 * photo (or a gear in local-only mode) that opens Settings. Hidden on the web, where the top bar has the account menu.
 */
export function AccountButton({ style }: { style?: React.CSSProperties }) {
  const user = useAccountUser();
  return (
    <Link to="/settings" className="account-btn" style={style} aria-label={user ? 'Account' : 'Settings'} title={user ? 'Account' : 'Settings'}>
      {user ? <Avatar user={user} size={32} /> : <Settings size={20} aria-hidden />}
    </Link>
  );
}

/** The account button's place in a tab page's title row: kept empty, since FloatingAccountButton is drawn over it. */
export function AccountSlot() {
  return <span className="account-slot" aria-hidden />;
}

/** A tab page's title row: the title (and anything beside it) on the left, the account button's place on the right. */
export function PageHead({ children }: { children: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-main">{children}</div>
      <AccountSlot />
    </div>
  );
}

/**
 * One account button for all the tab pages (Layout), over the current page's AccountSlot. It's the same on every tab,
 * so it stays still while pages swipe under it instead of sliding away with one and in with the next; it still
 * scrolls with the page (placed in page coordinates, not fixed). Measured again when the page changes, and hidden on
 * pages without a slot (a workout, Settings, the editors).
 */
export function FloatingAccountButton() {
  const { pathname } = useLocation();
  // Where it goes, and for which page: a position measured for another page isn't used (so it never shows on one
  // without a slot while that's being checked).
  const [at, setAt] = useState<{ top: number; left: number; pathname: string } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const slot = document.querySelector<HTMLElement>('main.tab-page:not(.swipe-peek) .account-slot');
      if (!slot) return false;
      // From layout offsets, not the on-screen box: a page rising in (its entrance animation) would put it too low.
      let top = 0;
      let left = 0;
      for (let el: HTMLElement | null = slot; el; el = el.offsetParent as HTMLElement | null) {
        top += el.offsetTop;
        left += el.offsetLeft;
      }
      setAt({ top, left, pathname });
      return true;
    };
    // Before paint when the page is there already (no blink on a tab change); else once it has drawn (it shows a
    // skeleton while its data loads), watched for a few seconds.
    let watch: MutationObserver | undefined;
    if (!place()) {
      watch = new MutationObserver(() => place() && watch?.disconnect());
      watch.observe(document.body, { childList: true, subtree: true });
    }
    const stop = setTimeout(() => watch?.disconnect(), 5000);
    // The page's height above the slot can change (fonts loading, the window resized).
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    return () => {
      watch?.disconnect();
      clearTimeout(stop);
      window.removeEventListener('resize', onResize);
    };
  }, [pathname]);

  if (!at || at.pathname !== pathname) return null;
  return createPortal(<AccountButton style={{ position: 'absolute', top: at.top, left: at.left, zIndex: 40 }} />, document.body);
}
