import { ArrowDownRight, ChevronDown, Disc3, Flame, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BAR_CHOICES } from '../core/plates';
import type { WeightUnit } from '../core/types';

export type SetKind = 'working' | 'warmup' | 'drop';

interface SetMenuProps {
  /** Working-set number ("1", "2"…), "Warm-up" or "Drop set". */
  label: string;
  kind: SetKind;
  /** Plates per side for this set's weight (barbell exercises only), e.g. "45 + 25 per side". */
  plates: string | null;
  weightText: string;
  /** Barbell exercises: what the bar weighs (display unit), changed for the exercise everywhere. */
  bar?: { weight: number; unit: WeightUnit; onChange: (weight: number) => void };
  onKind: (kind: SetKind) => void;
  onDelete: () => void;
}

/**
 * The set's number doubles as its menu: mark it as a warm-up or a drop set, see the plates for its weight (and change
 * the bar), or delete it. Keeping these behind the number leaves each row with just reps, weight and the check.
 */
export function SetMenu({ label, kind, plates, weightText, bar, onKind, onDelete }: SetMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };
  const choices = bar ? [...new Set([...BAR_CHOICES[bar.unit], bar.weight])].sort((a, b) => b - a) : [];

  return (
    <span className="set-menu-wrap" ref={ref}>
      <button
        className={`set-num${kind !== 'working' ? ` ${kind}` : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Set ${label} options`}
      >
        <span>{kind === 'warmup' ? 'W' : kind === 'drop' ? 'D' : label}</span>
        {/* Says it opens something: a plain number didn't read as a button. */}
        <ChevronDown size={11} strokeWidth={2.6} className="set-num-chevron" aria-hidden />
      </button>
      {open && (
        <div className="menu set-menu" role="menu">
          <button className="menu-item" role="menuitemcheckbox" aria-checked={kind === 'warmup'} onClick={() => choose(() => onKind(kind === 'warmup' ? 'working' : 'warmup'))}>
            <Flame size={15} /> {kind === 'warmup' ? 'Make it a working set' : 'Warm-up set'}
          </button>
          <button className="menu-item" role="menuitemcheckbox" aria-checked={kind === 'drop'} onClick={() => choose(() => onKind(kind === 'drop' ? 'working' : 'drop'))}>
            <ArrowDownRight size={15} /> {kind === 'drop' ? 'Make it a normal set' : 'Drop set'}
          </button>
          {plates && (
            <div className="menu-note">
              <Disc3 size={15} />
              <span>
                <strong>{weightText}</strong>: {plates}
              </span>
            </div>
          )}
          {bar && (
            <div className="set-menu-bar">
              <span className="muted small">Bar</span>
              {choices.map((w) => (
                <button key={w} className={`chip${w === bar.weight ? ' selected' : ''}`} aria-pressed={w === bar.weight} onClick={() => bar.onChange(w)}>
                  {w}
                </button>
              ))}
              <span className="muted small">{bar.unit}</span>
            </div>
          )}
          <button className="menu-item danger" role="menuitem" onClick={() => choose(onDelete)}>
            <Trash2 size={15} /> Delete set
          </button>
        </div>
      )}
    </span>
  );
}
