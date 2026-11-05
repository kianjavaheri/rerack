import { SharePreview } from '../components/SharePreview';
import { APP_NAME } from '../config';
import { decodeShare } from '../core/share';
import type { SignInProvider } from './AuthProvider';
import { SignInButtons } from './SignInButtons';

export function LoginScreen({
  onSignIn,
  onSkip,
  error,
}: {
  onSignIn: (provider: SignInProvider) => Promise<void>;
  onSkip: () => void;
  error: string | null;
}) {
  // Opened from a share link before signing in: show what it holds first, so it can be looked at before deciding.
  // (This screen sits above the router; the address is kept, so the share page opens after signing in.)
  const shared = window.location.pathname === '/share' ? decodeShare(window.location.hash.slice(1)) : null;
  return (
    <main className={`login${shared ? ' with-share' : ''}`}>
      {shared && (
        <div className="login-share">
          <SharePreview payload={shared} />
        </div>
      )}
      <div className="login-card">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <h1 className="title" style={{ marginTop: 20 }}>
          {APP_NAME}
        </h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
          {shared ? 'Sign in to add it to your workouts.' : 'Sign in to keep your workouts in sync.'}
        </p>
        <SignInButtons onSignIn={onSignIn} />
        {error && (
          <p className="small" role="alert" style={{ marginTop: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button className="btn-link login-skip" onClick={onSkip}>
          Use without an account
        </button>
        <p className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
          Your workouts stay on this device. You can sign in later from Settings.
        </p>
        {/* On the website, the way back to the landing page (the installed apps have none). */}
        <a className="muted small login-about web-only" href="/about">
          What’s {APP_NAME}?
        </a>
      </div>
    </main>
  );
}
