import { DEFAULT_REMINDER_AT, NOTIFICATION_KINDS, notificationOn } from '../core/notifications';
import type { NotificationKind, NotificationSettings } from '../core/types';

const MODES: { mode: NotificationSettings['mode']; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'none', label: 'None' },
  { mode: 'choose', label: 'Choose' },
];

/**
 * All, None, or Choose which kinds (each with a switch), plus the time of day for workout reminders when they're on.
 * Controlled: Settings saves each change, the intro keeps a draft until Continue.
 */
export function NotificationChoice({ value, onChange }: { value: NotificationSettings; onChange: (next: NotificationSettings) => void }) {
  const setMode = (mode: NotificationSettings['mode']) => {
    // Choosing starts from what's on now, so switching to it changes nothing until a switch is flipped.
    const kinds =
      mode === 'choose' && value.mode !== 'choose'
        ? Object.fromEntries(NOTIFICATION_KINDS.map(({ kind }) => [kind, value.mode === 'all']))
        : value.kinds;
    onChange({ ...value, mode, kinds });
  };
  const toggle = (kind: NotificationKind) => onChange({ ...value, kinds: { ...value.kinds, [kind]: !value.kinds?.[kind] } });
  const remindersOn = notificationOn({ notifications: value }, 'reminders');

  return (
    <div className="notify-choice">
      <div className="segmented" role="radiogroup" aria-label="Notifications">
        {MODES.map((m) => (
          <button key={m.mode} role="radio" aria-checked={value.mode === m.mode} className={value.mode === m.mode ? 'on' : ''} onClick={() => setMode(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="notify-kinds">
        {NOTIFICATION_KINDS.map(({ kind, name, detail }) => {
          const on = notificationOn({ notifications: value }, kind);
          return (
            <div key={kind} className={`notify-kind${value.mode !== 'choose' ? ' fixed' : ''}`}>
              <div style={{ minWidth: 0 }}>
                <div className="notify-kind-name">{name}</div>
                <div className="muted small">{detail}</div>
              </div>
              {value.mode === 'choose' ? (
                <button type="button" className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={name} onClick={() => toggle(kind)} />
              ) : (
                <span className="muted small">{on ? 'On' : 'Off'}</span>
              )}
            </div>
          );
        })}
      </div>
      {remindersOn && (
        <label className="notify-time">
          <span>Remind me at</span>
          <input
            type="time"
            className="input"
            value={value.reminderAt ?? DEFAULT_REMINDER_AT}
            onChange={(e) => e.target.value && onChange({ ...value, reminderAt: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}
