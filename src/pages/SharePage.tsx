import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import { HOME_PATH, PLAN_PATH } from '../config';
import { SharePreview } from '../components/SharePreview';
import { pluralize } from '../core/format';
import { decodeShare } from '../core/share';
import { addShared } from '../data/shared';

/**
 * Opened from a share link (/share#…): what it holds (`SharePreview`), and one button to add it. Someone not signed in
 * sees the same preview on the sign-in screen first (LoginScreen), then lands here.
 */
export function SharePage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(false);
  const payload = decodeShare(hash.slice(1));

  if (!payload) {
    return (
      <div className="narrow">
        <h1 className="title">Shared workout</h1>
        <div className="empty section">This link is incomplete or damaged. Ask for it to be shared again.</div>
      </div>
    );
  }

  const title = payload.routine?.name ?? payload.workouts[0]?.name ?? 'Shared workout';
  const add = async () => {
    setBusy(true);
    try {
      const { routineId, workoutIds } = await addShared(payload);
      notify(`Added “${title}”`);
      const to = routineId ? `/edit/routines/${routineId}` : `/edit/workouts/${workoutIds[0]}?from=${encodeURIComponent(PLAN_PATH)}`;
      navigate(to, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <Link to={HOME_PATH} className="back-link">
        <ArrowLeft size={15} /> Home
      </Link>
      <SharePreview payload={payload} />
      <p className="muted small" style={{ marginTop: 14 }}>
        Adds {pluralize(payload.workouts.length, 'workout')}
        {payload.routine ? ' and the routine' : ''} to your plan. Exercises you already have are reused; nothing of yours
        changes.
      </p>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          <Plus size={15} /> {busy ? 'Adding…' : 'Add to my workouts'}
        </button>
        <Link to={HOME_PATH} className="btn btn-ghost">
          Not now
        </Link>
      </div>
    </div>
  );
}
