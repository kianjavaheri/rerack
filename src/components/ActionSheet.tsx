import { useEffect, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface SheetAction {
  label: string;
  icon: ReactNode;
  /** Drawn in red (Remove). */
  danger?: boolean;
  onSelect: () => void;
}

/**
 * A sheet of actions as one grouped list, a hairline between rows: an exercise's or a set's ⋮ while logging, and every
 * press-and-hold on a card. Choosing one closes the sheet first, so an action that opens its own window (the exercise
 * search) isn't stacked on it.
 */
export function ActionSheet({
  title,
  actions,
  onClose,
  closeOnSelect = true,
  children,
}: {
  title: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
  /** false: choosing only runs the action, which closes the sheet itself or replaces it (e.g. with a rename dialog). */
  closeOnSelect?: boolean;
  /** Shown between the title and the list (a set's plates). */
  children?: ReactNode;
}) {
  // A hold that opened it may already have started selecting the card's text.
  useEffect(() => window.getSelection()?.removeAllRanges(), []);
  return (
    <Modal title={title} onClose={onClose}>
      {children}
      <div className="sheet-actions" role="menu">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`sheet-action${a.danger ? ' danger' : ''}`}
            role="menuitem"
            onClick={() => {
              if (closeOnSelect) onClose();
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
