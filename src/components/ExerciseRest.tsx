import { Timer } from 'lucide-react';
import { useState } from 'react';
import { now } from '../core/ids';
import { defaultRestSeconds, type Exercise } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { Modal } from './Modal';
import { formatRest } from './RestTimer';
import { RestLength } from './RestLength';

/**
 * An exercise's rest as a chip ("2:00", "Off"); tapping it sets that exercise's own rest, which is stored on the
 * exercise so it's the same in every workout. Checking off one of its sets starts a rest of that length.
 */
export function ExerciseRest({
  exercise,
  isolation,
  onChange,
}: {
  exercise: Exercise;
  /** An isolation lift: the default is Settings' isolation length. */
  isolation: boolean;
  /** The length changed (to this many seconds): a rest of this exercise under way follows it. */
  onChange?: (seconds: number) => void;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const fallback = defaultRestSeconds(settings, isolation);
  const seconds = exercise.restSeconds ?? fallback;
  const own = exercise.restSeconds != null;
  const save = (restSeconds: number | undefined) => {
    void repo.saveExercise({ ...exercise, restSeconds, updatedAt: now() });
    onChange?.(restSeconds ?? fallback);
  };

  return (
    <>
      <button
        className={`chip rest-chip${own ? ' own' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Rest for ${exercise.name}: ${seconds ? formatRest(seconds) : 'off'}`}
        title="Rest after each set of this exercise"
      >
        <Timer size={13} /> {seconds ? formatRest(seconds) : 'Off'}
      </button>
      {open && (
        <Modal title={`Rest for ${exercise.name}`} onClose={() => setOpen(false)}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Starts when you check off a set of this exercise, in every workout. 0:00 turns it off for this exercise.
          </p>
          <div className="spread" style={{ marginTop: 14 }}>
            <RestLength seconds={seconds} onChange={(s) => save(s)} />
            {own && (
              <button className="btn btn-ghost btn-sm" onClick={() => save(undefined)}>
                Use default ({fallback ? formatRest(fallback) : 'off'})
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
