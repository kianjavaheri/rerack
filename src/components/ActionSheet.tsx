import type { ReactNode } from 'react';
import { Modal } from './Modal';

export interface SheetAction {
  label: string;
  icon: ReactNode;
  /** Drawn in red (Remove). */
  danger?: boolean;
  onSelect: () => void;
}

/**
 * A sheet of actions as one grouped list, a hairline between rows (an exercise's ⋮ while logging). Choosing one
 * closes the sheet first, so an action that opens its own window (the exercise search) isn't stacked on it.
 */
export function ActionSheet({ title, actions, onClose }: { title: ReactNode; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="sheet-actions" role="menu">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`sheet-action${a.danger ? ' danger' : ''}`}
            role="menuitem"
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
