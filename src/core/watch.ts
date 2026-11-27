import { nativeAccent, type NativeTone } from './accents';
import { cancelResume, createSessionFromWorkout, finalizeSession, orderByProgress } from './sessions';
import { followedRoutine, lastPerformance, nextWorkoutInRoutine } from './stats';
import type { Exercise, ID, Routine, Session, SessionEntry, SetLog, Settings, Timestamp, WeightUnit, Workout } from './types';
import { DEFAULT_REST_SECONDS, restSecondsFor, weightStepFor } from './types';
import { barWeight, isBarbellExercise } from './plates';

/**
 * The Apple Watch app (ios/App/RerackWatch) logs a live workout on its own copy and sends each change to the phone as
 * an op, queued and replayed in order (WatchConnectivity, then src/native/watch.ts). The phone sends the watch a
 * `WatchState`: the open workout plus what the watch needs to log it without the phone (set placeholders, rest
 * lengths, workouts to start). Both shapes are mirrored in ios/App/RerackWatch/WatchModels.swift: keep them in step.
 */

/** A past set, for a set's placeholders (`hint` in SessionPage). */
export interface WatchSet {
  reps: number | null;
  weightKg: number | null;
  right?: { reps: number | null; weightKg: number | null };
}

export interface WatchExercise {
  name: string;
  /** Seconds of rest after its sets (`restSecondsFor`, with compound/isolation defaults); 0 = none. */
  rest: number;
  bodyweight: boolean;
  /** Its picture's address, for the phone's lock screen when the watch moves on to it ('' for none). */
  image: string;
  /** Barbell lifts only (Per side is offered): the bar's weight in the display unit (`barWeight`). */
  bar?: number;
}

/** A slot of a workout the watch can start: what `createSessionFromWorkout` would make, and last time's sets. */
export interface WatchSlot {
  exerciseId: ID;
  targetSets: number;
  targetReps?: string;
  notes?: string;
  supersetNext?: boolean;
  perSide?: boolean;
  sides?: boolean;
  last: WatchSet[];
}

export interface WatchWorkout {
  id: ID;
  name: string;
  routineId: ID | null;
  slots: WatchSlot[];
}

export interface WatchState {
  v: 1;
  unit: WeightUnit;
  /** Settings' rest timer switch: off, nothing starts rests. */
  restOn: boolean;
  /** What the rest bar's Start uses with no rest yet this workout (`settings.restSeconds`, else 2:00). */
  defaultRest: number;
  /** Settings' "Rest after an exercise's last set". Missing (older phones): off. */
  restAfterLastSet?: boolean;
  /** The accent in dark mode (the watch is always dark; `nativeAccent`): its sweep, one solid colour, text on it. */
  colors?: NativeTone;
  /** What a turn of the Crown adds to a set's weight, in `unit` (Settings' weight step). Missing (older phones): 5 lb / 2.5 kg. */
  weightStep?: number;
  /** The open live workout, if any (without `resumedFrom`, which the watch never needs). */
  session: Session | null;
  /** Last time's sets for each of the open workout's entries, by entry id. */
  last: Record<ID, WatchSet[]>;
  exercises: Record<ID, WatchExercise>;
  /** The followed routine's next workout. */
  upNext: ID | null;
  workouts: WatchWorkout[];
}

interface OpBase {
  /** The watch app install that sent it, and its running number there (the phone ignores repeats). */
  src: string;
  seq: number;
  at: Timestamp;
  sessionId: ID;
}

export type WatchOp = OpBase &
  (
    | { kind: 'start'; session: Session }
    /** A set as it is now (added if it isn't there yet): ops carry values, not changes, so a repeat does no harm. */
    | { kind: 'set'; entryId: ID; set: SetLog }
    /** Per side turned on or off for one exercise of this workout (`SessionEntry.perSide`). */
    | { kind: 'perSide'; entryId: ID; perSide: boolean }
    | { kind: 'rest'; restEndsAt: Timestamp | null; restLength?: number; restExerciseId?: ID | null; restHidden?: boolean }
    /** `healthSaved`: the watch saved it to Apple Health (with heart rate), so the phone mustn't add its own copy. */
    | { kind: 'finish'; finishedAt: Timestamp; healthSaved: boolean }
    | { kind: 'cancel' }
    /** The watch's workout session is running for this session (it alerts rest itself) or stopped. */
    | { kind: 'presence'; running: boolean }
  );

type Sided<T> = T & { right?: { reps: number | null; weightKg: number | null } | null; sides?: boolean };

const toWatchSets = (sets: SetLog[]): WatchSet[] =>
  sets.map((s) => {
    const right = (s as Sided<SetLog>).right;
    return right ? { reps: s.reps, weightKg: s.weightKg, right: { reps: right.reps, weightKg: right.weightKg } } : { reps: s.reps, weightKg: s.weightKg };
  });

export function watchState(input: {
  sessions: Session[];
  exercises: Exercise[];
  workouts: Workout[];
  routines: Routine[];
  settings: Settings;
  isIsolation: (exercise: Exercise | undefined) => boolean;
  pictureOf: (exerciseId: ID) => string | undefined;
}): WatchState {
  const { sessions, exercises, workouts, routines, settings, isIsolation, pictureOf } = input;
  const open = sessions.find((s) => !s.finishedAt && s.live !== false) ?? null;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const used = new Set<ID>();

  const last: Record<ID, WatchSet[]> = {};
  let session: Session | null = null;
  if (open) {
    const { resumedFrom: _left, ...rest } = open;
    session = rest;
    open.entries.forEach((entry, i) => {
      used.add(entry.exerciseId);
      const occurrence = open.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length;
      last[entry.id] = toWatchSets(lastPerformance(entry.exerciseId, sessions, { excludeSessionId: open.id, before: open.startedAt, occurrence }));
    });
  }

  const followed = followedRoutine(routines, settings.activeRoutineId);
  const routineFor = (workoutId: ID) =>
    (followed?.workoutIds.includes(workoutId) ? followed : routines.find((r) => r.workoutIds.includes(workoutId)))?.id ?? null;
  const watchWorkouts = [...workouts]
    .filter((w) => w.exercises.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((workout): WatchWorkout => {
      const routineId = routineFor(workout.id);
      const made = createSessionFromWorkout(workout, routineId, { live: true }, sessions);
      return {
        id: workout.id,
        name: workout.name,
        routineId,
        slots: made.entries.map((entry, i) => {
          used.add(entry.exerciseId);
          const occurrence = made.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length;
          return {
            exerciseId: entry.exerciseId,
            targetSets: entry.targetSets ?? entry.sets.length,
            targetReps: entry.targetReps,
            notes: entry.notes,
            supersetNext: entry.supersetNext,
            perSide: entry.perSide,
            sides: (entry as Sided<SessionEntry>).sides,
            last: toWatchSets(lastPerformance(entry.exerciseId, sessions, { occurrence })),
          };
        }),
      };
    });

  const watchExercises: Record<ID, WatchExercise> = {};
  for (const id of used) {
    const exercise = byId.get(id);
    watchExercises[id] = {
      name: exercise?.name ?? 'Exercise',
      rest: restSecondsFor(exercise, settings, isIsolation(exercise)),
      bodyweight: exercise?.kind === 'bodyweight',
      image: pictureOf(id) ?? '',
      ...(isBarbellExercise(exercise) ? { bar: barWeight(exercise, settings.unit) } : {}),
    };
  }

  return {
    v: 1,
    unit: settings.unit,
    restOn: settings.restTimer !== false,
    defaultRest: settings.restSeconds || DEFAULT_REST_SECONDS,
    restAfterLastSet: !!settings.restAfterLastSet,
    weightStep: weightStepFor(settings),
    colors: nativeAccent(settings).dark,
    session,
    last,
    exercises: watchExercises,
    upNext: followed ? nextWorkoutInRoutine(followed, sessions) : null,
    workouts: watchWorkouts,
  };
}

/** What an op does to the stored session: save this, delete it, or nothing (already applied, or no longer there). */
export type WatchOpResult = { save: Session } | { delete: ID } | null;

export function applyWatchOp(session: Session | undefined, op: WatchOp): WatchOpResult {
  switch (op.kind) {
    case 'start':
      // Already saved (a repeat) or the phone has it: leave it.
      return session ? null : { save: { ...op.session, lastActivityAt: op.at } };
    case 'set': {
      if (!session) return null;
      const entry = session.entries.find((e) => e.id === op.entryId);
      if (!entry) return null;
      const existing = entry.sets.find((s) => s.id === op.set.id) as Sided<SetLog> | undefined;
      const sent = op.set as Sided<SetLog>;
      const set: SetLog = existing?.right != null && sent.right == null ? ({ ...sent, right: existing.right } as SetLog) : op.set;
      const sets = existing ? entry.sets.map((s) => (s.id === set.id ? set : s)) : [...entry.sets, set];
      let entries = session.entries.map((e) => (e.id === entry.id ? { ...e, sets } : e));
      // Finished ones first, then ones under way (as SessionPage does when a set is checked off).
      if (op.set.done && !session.finishedAt) entries = orderByProgress(entries, entry.id);
      return { save: { ...session, entries, lastActivityAt: op.at } };
    }
    case 'perSide': {
      if (!session) return null;
      const entries = session.entries.map((e) => (e.id === op.entryId ? { ...e, perSide: op.perSide || undefined } : e));
      return { save: { ...session, entries, lastActivityAt: op.at } };
    }
    case 'rest': {
      if (!session || session.finishedAt) return null;
      const next: Session = { ...session, restEndsAt: op.restEndsAt, restPausedLeft: null, lastActivityAt: op.at };
      if (op.restLength !== undefined) next.restLength = op.restLength;
      if (op.restExerciseId !== undefined) next.restExerciseId = op.restExerciseId;
      if (op.restHidden !== undefined) next.restHidden = op.restHidden;
      return { save: next };
    }
    case 'finish': {
      if (!session || session.finishedAt) return null;
      const finished = finalizeSession({ ...session, finishedAt: op.finishedAt, restEndsAt: null });
      return { save: op.healthSaved ? { ...finished, savedByWatch: true } : finished };
    }
    case 'cancel':
      if (!session || session.finishedAt) return null;
      return session.resumedFrom ? { save: cancelResume(session) } : { delete: session.id };
    case 'presence':
      return null;
  }
}
