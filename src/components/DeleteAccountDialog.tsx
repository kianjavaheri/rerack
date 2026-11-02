import { useState } from 'react';
import { Modal } from './Modal';

/** What has to be typed, like GitHub's: long enough that it can't happen by accident. */
const PHRASE = 'delete my account';

/**
 * Deleting the account, which can't be undone: what goes, then typing "delete my account" before the button works.
 * Signing in again (in `deleteAccount`) comes after this.
 */
export function DeleteAccountDialog({ email, onDelete, onClose }: { email: string | null; onDelete: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toLowerCase() === PHRASE;
  return (
    <Modal title="Delete your account?" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        This deletes {email ? <strong>{email}</strong> : 'your account'} and everything in it, on all your devices: every workout you’ve
        logged, your routines, exercises, profile and settings.
      </p>
      <p className="delete-warning">It can’t be undone.</p>
      <label style={{ display: 'block', marginTop: 16 }}>
        <span className="label">
          To confirm, type <strong className="delete-phrase">{PHRASE}</strong>
        </span>
        <input
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && ok && onDelete()}
        />
      </label>
      <p className="muted small">You’ll sign in once more after this, to prove it’s you.</p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-delete" disabled={!ok} onClick={onDelete}>
          Delete account
        </button>
      </div>
    </Modal>
  );
}
