import { FORGOTTEN_AFTER_MS, lastActivity } from './sessions';
import { doneOn, scheduledOn } from './stats';
import type { ID, NotificationKind, NotificationSettings, Routine, Session, Settings } from './types';

export const DEFAULT_REMINDER_AT = '17:00';

/** The kinds, in the order they're listed, with how they're described in Settings and the intro. */
export const NOTIFICATION_KINDS: { kind: NotificationKind; name: string; detail: string }[] = [
  { kind: 'rest', name: 'Rest over', detail: 'When a rest between sets ends, even with the phone locked.' },
  { kind: 'reminders', name: 'Workout reminders', detail: 'On the days your routine plans a workout.' },
  { kind: 'open', name: 'Workout left open', detail: 'When a workout has had no changes for 3 hours.' },
];

/** Whether a kind may be sent. Not chosen yet: only rest alerts, as before there was a choice. */
export function notificationOn(settings: Pick<Settings, 'notifications'>, kind: NotificationKind): boolean {
  const n = settings.notifications;
  if (!n) return kind === 'rest';
  if (n.mode === 'none') return false;
  if (n.mode === 'all') return true;
  return !!n.kinds?.[kind];
}

export const anyNotificationOn = (n: NotificationSettings) => NOTIFICATION_KINDS.some(({ kind }) => notificationOn({ notifications: n }, kind));

export interface PlannedNotification {
  at: Date;
  title: string;
  body: string;
}

/**
 * Reminders for the followed routine's planned days over the next `days` days, at `time` ("HH:MM"). Not for a day
 * whose time has passed, or today once that workout's been done.
 */
export function reminderPlan(
  routine: Routine,
  sessions: Session[],
  workoutName: (id: ID) => string | undefined,
  time = DEFAULT_REMINDER_AT,
  now = new Date(),
  days = 14,
): PlannedNotification[] {
  const [h, m] = time.split(':').map(Number);
  const plan: PlannedNotification[] = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h || 0, m || 0);
    if (at <= now) continue;
    const done = i === 0 ? doneOn(sessions, now) : new Set<ID | null>();
    const names = scheduledOn(routine, sessions, at, now)
      .filter((id) => !done.has(id))
      .map(workoutName)
      .filter((n): n is string => !!n);
    if (!names.length) continue;
    plan.push({ at, title: `${names.join(' & ')} today`, body: `Planned in ${routine.name}.` });
  }
  return plan;
}

/** When to ask about a workout left open: 3 hours after its last change (null once that's passed or it's finished). */
export function openWorkoutAlert(session: Session | null | undefined, now = Date.now()): PlannedNotification | null {
  if (!session || session.finishedAt) return null;
  const at = Math.max(Date.parse(lastActivity(session)), session.snoozedAt ? Date.parse(session.snoozedAt) : 0) + FORGOTTEN_AFTER_MS;
  if (at <= now) return null;
  return { at: new Date(at), title: 'Still working out?', body: `${session.name} has had no changes for 3 hours. Finish it or keep going.` };
}
