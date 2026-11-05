import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { WEEKDAYS } from '../core/stats';
import { PROGRAMS, type Program } from '../data/programs';
import { Modal } from './Modal';

const daysText = (days: number[] | undefined) =>
  days?.length ? [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ') : '';

/**
 * Ready-made programs as cards: tap one to see its workouts and exercises (sets × reps), then use it. `busy` is the one
 * being added. A card opens and closes smoothly (its body is always there, its height animated from 0), and one that
 * opens past the bottom of the view is scrolled into it.
 */
export function ProgramList({ onUse, busy }: { onUse: (program: Program) => void; busy?: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string, card: HTMLElement) => {
    const opening = open !== id;
    setOpen(opening ? id : null);
    // After the open animation (which also closes another card above it, moving this one up).
    if (opening) setTimeout(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 340);
  };
  return (
    <div className="program-list">
      {PROGRAMS.map((p) => {
        const expanded = open === p.id;
        return (
          <div key={p.id} className={`card program${expanded ? ' open' : ''}`}>
            <button className="program-head" onClick={(e) => toggle(p.id, e.currentTarget.parentElement!)} aria-expanded={expanded}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="card-title" style={{ display: 'block' }}>
                  {p.name}
                </span>
                <span className="muted small">{p.summary}</span>
              </span>
              <ChevronDown size={18} className="program-chevron muted" />
            </button>
            <div className="program-reveal" inert={!expanded}>
              <div className="program-clip">
                <div className="program-body">
                  <p className="small" style={{ margin: '0 0 12px' }}>
                    {p.description}
                  </p>
                  {p.workouts.map((w) => (
                    <div key={w.name} className="program-workout">
                      <div className="program-workout-name">
                        <strong>{w.name}</strong>
                        <span className="muted small">{p.rotateEvery ? 'Alternate, every other day' : daysText(w.days)}</span>
                      </div>
                      <ul>
                        {w.exercises.map(([name, , sets, reps]) => (
                          <li key={name}>
                            <span>{name}</span>
                            <span className="muted tnum">
                              {sets} × {reps}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={!!busy} onClick={() => onUse(p)}>
                    {busy === p.id ? 'Adding…' : 'Use this program'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Workouts' "Programs" window. */
export function ProgramsWindow({ onUse, busy, onClose }: { onUse: (program: Program) => void; busy?: string | null; onClose: () => void }) {
  return (
    <Modal title="Programs" onClose={onClose}>
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        A routine to start from. It’s added to yours, and you can change anything in it afterwards.
      </p>
      <ProgramList onUse={onUse} busy={busy} />
    </Modal>
  );
}
