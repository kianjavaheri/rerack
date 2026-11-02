import { isImportedSession, loggedEntries, sessionDurationMinutes } from './sessions';
import { estimate1RM, groupSets, isCompletedSet, sessionSummary } from './stats';
import type { ID, Session } from './types';

export interface ExerciseSummary {
  exerciseId: ID;
  /** "2 × 8 · 145 lb"-style groups of the completed sets. */
  groups: ReturnType<typeof groupSets>;
  /** Best estimated one-rep max this time, in kg (0 for bodyweight-only sets), and reps for bodyweight. */
  bestE1rmKg: number;
  totalReps: number;
  /** Compared with the same exercise last time this workout was done: up, down, same, or new (not done before). */
  trend: 'up' | 'down' | 'same' | 'new';
}

export interface WorkoutSummary {
  minutes: number | null;
  sets: number;
  volumeKg: number;
  exercises: ExerciseSummary[];
  /** The last time this workout was done before, to compare with (null for a freestyle or a first time). */
  previous: { date: string; minutes: number | null; sets: number; volumeKg: number } | null;
}

/** An exercise's best estimated max and total reps over these sets. */
function bests(sets: Session['entries'][number]['sets']) {
  const done = sets.filter(isCompletedSet);
  return {
    bestE1rmKg: Math.max(0, ...done.map((s) => (s.weightKg ? estimate1RM(s.weightKg, s.reps ?? 0) : 0))),
    totalReps: done.reduce((n, s) => n + (s.reps ?? 0), 0),
  };
}

/**
 * What a finished workout came to, and how it compares with the last time the same workout was done: its time, sets,
 * volume, and each exercise's sets with whether it went up (best estimated max, or total reps for bodyweight).
 */
export function workoutSummary(session: Session, sessions: Session[]): WorkoutSummary {
  const totals = sessionSummary(session);
  const before = session.workoutId
    ? sessions
        .filter((s) => s.id !== session.id && s.workoutId === session.workoutId && s.finishedAt && !isImportedSession(s) && s.startedAt < session.startedAt)
        .filter((s) => sessionSummary(s).sets > 0)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined;

  const exercises = loggedEntries(session).map((entry): ExerciseSummary => {
    const now = bests(entry.sets);
    const then = before?.entries.find((e) => e.exerciseId === entry.exerciseId && e.sets.some(isCompletedSet));
    let trend: ExerciseSummary['trend'] = 'new';
    if (then) {
      const was = bests(then.sets);
      const [a, b] = now.bestE1rmKg > 0 || was.bestE1rmKg > 0 ? [now.bestE1rmKg, was.bestE1rmKg] : [now.totalReps, was.totalReps];
      trend = Math.abs(a - b) < 0.01 ? 'same' : a > b ? 'up' : 'down';
    }
    return { exerciseId: entry.exerciseId, groups: groupSets(entry.sets.filter(isCompletedSet)), ...now, trend };
  });

  const prev = before ? sessionSummary(before) : null;
  return {
    minutes: sessionDurationMinutes(session),
    sets: totals.sets,
    volumeKg: totals.volumeKg,
    exercises,
    previous: before && prev ? { date: before.startedAt, minutes: sessionDurationMinutes(before), sets: prev.sets, volumeKg: prev.volumeKg } : null,
  };
}
