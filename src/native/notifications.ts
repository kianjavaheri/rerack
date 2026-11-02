import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import { notificationOn, openWorkoutAlert, reminderPlan, type PlannedNotification } from '../core/notifications';
import { followedRoutine } from '../core/stats';
import type { Session, Settings } from '../core/types';
import { useRoutines, useWorkouts } from '../hooks/useRepo';
import { isNative } from './platform';

// Ids: 1 is "Rest over" (native/rest.ts); 2 the workout left open; reminders from 100.
const OPEN_ID = 2;
const REMINDER_IDS = Array.from({ length: 14 }, (_, i) => 100 + i);

/** Asks iOS for permission (once; later it just says what was chosen). True when notifications may be shown. */
export async function askNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display.startsWith('prompt')) permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  } catch {
    return false;
  }
}

/** Whether iOS currently allows them, without asking. */
export async function notificationsAllowed(): Promise<boolean | null> {
  if (!isNative) return null;
  const permission = await LocalNotifications.checkPermissions().catch(() => null);
  return permission ? permission.display === 'granted' : null;
}

let queue = Promise.resolve();

/**
 * In the iPhone app, keeps the scheduled notifications in step with the data: reminders for the next two weeks of the
 * followed routine's planned days (today's dropped once it's done), and "Still working out?" three hours after an open
 * workout's last change. Everything is cancelled and scheduled again whenever any of it changes; nothing asks for
 * permission here (Settings and the intro do).
 */
export function useScheduledNotifications(sessions: Session[] | undefined, settings: Settings) {
  const routines = useRoutines();
  const workouts = useWorkouts();
  const remind = notificationOn(settings, 'reminders');
  const openOn = notificationOn(settings, 'open');

  const routine = routines ? followedRoutine(routines, settings.activeRoutineId) : null;
  const names = new Map(workouts?.map((w) => [w.id, w.name]));
  const plan: PlannedNotification[] =
    remind && routine && sessions && workouts ? reminderPlan(routine, sessions, (id) => names.get(id), settings.notifications?.reminderAt) : [];
  const open = openOn ? openWorkoutAlert(sessions?.find((s) => !s.finishedAt && s.live !== false)) : null;
  // One string for "did anything change", so re-renders that don't change the schedule do nothing.
  const key = JSON.stringify([plan.map((p) => [p.at.getTime(), p.title, p.body]), open && [open.at.getTime(), open.title, open.body]]);
  const ready = sessions !== undefined && routines !== undefined && workouts !== undefined;

  useEffect(() => {
    if (!isNative || !ready) return;
    const [reminders, alert] = JSON.parse(key) as [[number, string, string][], [number, string, string] | null];
    queue = queue
      .then(async () => {
        await LocalNotifications.cancel({ notifications: [OPEN_ID, ...REMINDER_IDS].map((id) => ({ id })) });
        if (!(await notificationsAllowed())) return;
        const list = [
          ...reminders.map(([at, title, body], i) => ({ id: REMINDER_IDS[i], title, body, schedule: { at: new Date(at) } })),
          ...(alert ? [{ id: OPEN_ID, title: alert[1], body: alert[2], schedule: { at: new Date(alert[0]) } }] : []),
        ];
        if (list.length) await LocalNotifications.schedule({ notifications: list });
      })
      .catch((err) => console.warn('Notifications:', err));
  }, [key, ready]);
}
