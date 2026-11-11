import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button, for things that can't be undone. */
  danger?: boolean;
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface FeedbackValue {
  /** In-app replacement for confirm(): resolves true when the confirm button is chosen. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A short banner; with `undo`, it offers to reverse what just happened (instead of asking first). */
  notify: (message: string, options?: { undo?: () => void }) => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);
const TOAST_MS = 5000;

/**
 * Confirmation dialogs and undo banners, used instead of the browser's confirm()/alert() (which on iOS show the site
 * address and an ambiguous Cancel/OK). Deletes act at once and offer Undo; only things that can't be undone ask first.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsking({ ...options, resolve })),
    [],
  );

  const notify = useCallback((message: string, options?: { undo?: () => void }) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo: options?.undo });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const answer = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, notify }}>
      {children}
      {asking && (
        <Modal title={asking.title} onClose={() => answer(false)}>
          {asking.message && <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{asking.message}</div>}
          <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
            <button className="btn btn-sm" onClick={() => answer(false)}>
              {asking.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`btn btn-sm${asking.danger ? '' : ' btn-primary'}`}
              style={asking.danger ? { background: 'var(--danger)', color: 'var(--page-base)' } : undefined}
              onClick={() => answer(true)}
            >
              {asking.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <ToastBanner
          key={toast.id}
          toast={toast}
          onUndo={() => {
            toast.undo?.();
            setToast(null);
          }}
          onDismiss={() => {
            clearTimeout(timer.current);
            setToast(null);
          }}
        />
      )}
    </FeedbackContext.Provider>
  );
}

/** A banner that can be swiped away upwards (past 30 px or a quick flick); a short pull down springs back. */
function ToastBanner({ toast, onUndo, onDismiss }: { toast: Toast; onUndo: () => void; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  const place = (dy: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.25s var(--ease), opacity 0.25s var(--ease)' : 'none';
    // Down only gives a little (rubber band); up follows the finger and fades.
    const y = dy > 0 ? dy / 4 : dy;
    el.style.transform = `translate(-50%, ${y}px)`;
    el.style.opacity = dy < 0 ? String(Math.max(0, 1 + dy / 80)) : '1';
  };

  return (
    <div
      ref={ref}
      className="toast"
      role="status"
      onTouchStart={(e) => {
        drag.current = { y: e.touches[0].clientY, t: e.timeStamp, dy: 0 };
        if (ref.current) ref.current.style.animation = 'none';
      }}
      onTouchMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.dy = e.touches[0].clientY - d.y;
        place(d.dy, false);
      }}
      onTouchEnd={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        const speed = d.dy / Math.max(1, e.timeStamp - d.t);
        if (d.dy < -30 || (d.dy < -8 && speed < -0.4)) {
          place(-120, true);
          setTimeout(onDismiss, 200);
        } else place(0, true);
      }}
      onTouchCancel={() => {
        drag.current = null;
        place(0, true);
      }}
    >
      <span>{toast.message}</span>
      {toast.undo && (
        <button className="toast-undo" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
