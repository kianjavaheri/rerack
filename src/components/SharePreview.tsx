import { pluralize } from '../core/format';
import type { SharePayload } from '../core/share';
import { WEEKDAYS } from '../core/stats';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** What a share link holds: its name, then each workout with its days and every exercise's sets × reps. */
export function SharePreview({ payload }: { payload: SharePayload }) {
  const routine = payload.routine;
  const title = routine?.name ?? payload.workouts[0]?.name ?? 'Shared workout';
  return (
    <div className="share-preview">
      <span className="muted small">
        Shared {routine ? `routine · ${pluralize(payload.workouts.length, 'workout')}` : 'workout'}
        {routine?.rotateEvery ? ` · one every ${routine.rotateEvery === 1 ? 'day' : `${routine.rotateEvery} days`}` : ''}
      </span>
      <h1 className="title" style={{ marginTop: 2 }}>
        {title}
      </h1>
      <div className="stack" style={{ marginTop: 16, gap: 10 }}>
        {payload.workouts.map((w, i) => {
          const days = routine?.days?.[i] ?? [];
          return (
            <div key={i} className="card share-workout">
              <div className="program-workout-name">
                <strong>{w.name}</strong>
                {days.length > 0 && (
                  <span className="muted small">
                    {WEEK_ORDER.filter((d) => days.includes(d))
                      .map((d) => WEEKDAYS[d])
                      .join(', ')}
                  </span>
                )}
              </div>
              {w.notes && <p className="muted small share-notes">{w.notes}</p>}
              <ul className="share-exercises">
                {w.exercises.map((e, j) => (
                  <li key={j}>
                    <span>
                      {e.name}
                      {e.notes && <span className="muted"> {e.notes}</span>}
                    </span>
                    <span className="muted tnum">
                      {e.targetSets} × {e.targetReps}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
