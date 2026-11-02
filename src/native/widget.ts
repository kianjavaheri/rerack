import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import { dayString } from '../core/body';
import { doneOn, followedRoutine, scheduledOn } from '../core/stats';
import type { Session, Settings } from '../core/types';
import { useRoutines, useWorkouts } from '../hooks/useRepo';
import { isNative } from './platform';

/** ios/App/App/AppWidgetPlugin.swift: saves HomeWidgetData (ios/App/Shared/HomeWidgetData.swift) for the widget. */
const AppWidget = registerPlugin<{ update(options: { json: string }): Promise<void> }>('AppWidget');

/**
 * In the iPhone app, keeps the home-screen widget's data current: the followed routine and, for this week and next
 * (Monday on), each day's planned workouts and whether it was trained. The widget works out "today" itself.
 */
export function useHomeWidget(sessions: Session[] | undefined, settings: Settings) {
  const routines = useRoutines();
  const workouts = useWorkouts();
  const ready = isNative && !!sessions && !!routines && !!workouts;
  let json = '';
  if (ready) {
    const routine = followedRoutine(routines, settings.activeRoutineId);
    const names = new Map(workouts.map((w) => [w.id, w.name]));
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 12);
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12);
      const planned = routine ? scheduledOn(routine, sessions, date, now).flatMap((id) => names.get(id) ?? []) : [];
      return { date: dayString(date), planned, done: doneOn(sessions, date).size > 0 };
    });
    // writtenAt changes every render, so it's left out of the comparison below and added when sending.
    json = JSON.stringify({ routine: routine?.name ?? null, days });
  }

  useEffect(() => {
    if (!json) return;
    const data = { ...JSON.parse(json), writtenAt: Date.now() };
    void AppWidget.update({ json: JSON.stringify(data) }).catch((err) => console.warn('Widget:', err));
  }, [json]);
}
