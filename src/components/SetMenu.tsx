import { ArrowDownRight, Disc3, Flame, MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { hapticDelete } from '../utils/haptics';
import { ActionSheet, type SheetAction } from './ActionSheet';
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

/** A set's number at the start of its row: "1", or "W" for a warm-up and "D" for a drop set. */
export function SetNumber({ label, kind }: { label: string; kind: SetKind }) {
  return <span className={`set-num${kind !== 'working' ? ` ${kind}` : ''}`}>{kind === 'warmup' ? 'W' : kind === 'drop' ? 'D' : label}</span>;
}

/**
 * A set's ⋮ at the end of its row (the same icon as the exercise's own menu): a sheet like the exercise's, to mark it
 * as a warm-up or a drop set, see the plates for its weight (and change the bar), or delete it.
 */
export function SetMenu({ label, kind, plates, weightText, bar, onKind, onDelete }: SetMenuProps) {
  const [open, setOpen] = useState(false);
  const choices = bar ? [...new Set([...BAR_CHOICES[bar.unit], bar.weight])].sort((a, b) => b - a) : [];
  const name = kind === 'warmup' ? 'Warm-up set' : kind === 'drop' ? 'Drop set' : `Set ${label}`;

  const actions: SheetAction[] = [
    {
      label: kind === 'warmup' ? 'Make it a working set' : 'Warm-up set',
      icon: <Flame size={20} />,
      onSelect: () => onKind(kind === 'warmup' ? 'working' : 'warmup'),
    },
    {
      label: kind === 'drop' ? 'Make it a normal set' : 'Drop set',
      icon: <ArrowDownRight size={20} />,
      onSelect: () => onKind(kind === 'drop' ? 'working' : 'drop'),
    },
    {
      label: 'Delete set',
      icon: <Trash2 size={20} />,
      danger: true,
      onSelect: () => {
        hapticDelete();
        onDelete();
      },
    },
  ];

  return (
    <>
      <button className={`icon-btn set-more${open ? ' open' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${name} options`}>
        <MoreVertical size={18} />
      </button>
      {open && (
        <ActionSheet title={name} actions={actions} onClose={() => setOpen(false)}>
          {(plates || bar) && (
            <div className="set-sheet-plates">
              {plates && (
                <div className="menu-note">
                  <Disc3 size={18} />
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
            </div>
          )}
        </ActionSheet>
      )}
    </>
  );
}
