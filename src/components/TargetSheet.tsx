import { Target } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_REPS } from '../config';
import type { SessionEntry } from '../core/types';
import { Modal } from './Modal';

/** A rep target ("6-12", "8") as its two ends; anything that isn't one reads as empty. */
function ends(target: string | undefined): [string, string] {
  const nums = target?.match(/\d+/g) ?? [];
  return [nums[0] ?? '', nums[1] && nums[1] !== nums[0] ? nums[1] : ''];
}

/** The two ends back as a target: "6-12", or "8" with one (either way round); null with none. */
function toTarget(from: string, to: string): string | null {
  const [a, b] = [parseInt(from, 10), parseInt(to, 10)].map((n) => (n > 0 ? n : null));
  if (a && b && a !== b) return `${Math.min(a, b)}-${Math.max(a, b)}`;
  const one = a ?? b;
  return one ? String(one) : null;
}

/**
 * An exercise's rep target while logging (the target by the Reps header): "Aim for 6-12 reps per set", and From / To
 * fields to change it for this workout only; the saved workout keeps its own. (Two number fields: iOS's number pad
 * has no hyphen to type "6-12" with.)
 */
export function TargetSheet({ entry, onChange, onClose }: { entry: SessionEntry; onChange: (targetReps: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState(() => ends(entry.targetReps)[0]);
  const [to, setTo] = useState(() => ends(entry.targetReps)[1]);
  const shown = toTarget(from, to) ?? entry.targetReps;
  const save = () => {
    const target = toTarget(from, to);
    if (target && target !== entry.targetReps) onChange(target);
    onClose();
  };
  const [dFrom, dTo] = ends(DEFAULT_REPS);
  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label style={{ flex: 1 }}>
      <span className="label">{label}</span>
      <input
        className="input tnum"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label={`${label} reps`}
      />
    </label>
  );
  return (
    <Modal title="Rep target" onClose={save}>
      <div className="target-aim">
        <Target size={22} />
        <div>
          {shown ? (
            <>
              Aim for <strong>{shown}</strong> {shown === '1' ? 'rep' : 'reps'} per set
            </>
          ) : (
            'No rep target yet'
          )}
          {entry.targetSets ? <div className="muted small">{entry.targetSets} sets planned</div> : null}
        </div>
      </div>
      <div className="row" style={{ gap: 10, marginTop: 16, alignItems: 'flex-end' }}>
        {field('From', from, setFrom, dFrom)}
        <span className="muted" style={{ paddingBottom: 10 }}>–</span>
        {field('To', to, setTo, dTo)}
      </div>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        Leave To empty for an exact number. Changes this workout only.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={save}>
          Done
        </button>
      </div>
    </Modal>
  );
}
