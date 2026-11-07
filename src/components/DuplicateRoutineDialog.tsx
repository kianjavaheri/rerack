import { useNavigate } from 'react-router-dom';
import { cloneRoutine, cloneWorkout } from '../core/plan';
import type { ID, Routine, Workout } from '../core/types';
import { repo } from '../data';
import { Modal } from './Modal';

interface Props {
  routine: Routine;
  routines: Routine[];
  workouts: Workout[];
  onClose: () => void;
}

/**
 * Duplicate a routine to change it: with copies of its workouts (changed on their own), or sharing the same ones (only
 * the schedule is its own). Then opens the copy's editor.
 */
export function DuplicateRoutineDialog({ routine, routines, workouts, onClose }: Props) {
  const navigate = useNavigate();

  const duplicate = async (copyWorkouts: boolean) => {
    const copies = new Map<ID, ID>();
    if (copyWorkouts) {
      const taken = [...workouts];
      for (const id of routine.workoutIds) {
        const w = workouts.find((x) => x.id === id);
        if (!w) continue;
        const copy = cloneWorkout(w, taken);
        taken.push(copy);
        copies.set(id, copy.id);
        await repo.saveWorkout(copy);
      }
    }
    const copy = cloneRoutine(routine, routines, copyWorkouts ? copies : undefined);
    await repo.saveRoutine(copy);
    onClose();
    navigate(`/edit/routines/${copy.id}`);
  };

  return (
    <Modal title={`Duplicate “${routine.name}”`} onClose={onClose}>
      <div className="stack" style={{ gap: 4, marginInline: -12 }}>
        <button className="list-row" onClick={() => void duplicate(true)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Copy the workouts too</div>
            <div className="muted small">Change anything in the copy without touching “{routine.name}”.</div>
          </div>
        </button>
        <button className="list-row" onClick={() => void duplicate(false)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Use the same workouts</div>
            <div className="muted small">Only the schedule is its own. Edits to a workout apply in both.</div>
          </div>
        </button>
      </div>
    </Modal>
  );
}
