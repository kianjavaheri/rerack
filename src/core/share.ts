import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Exercise, Routine, Workout } from './types';

/** An exercise as it travels in a share link: by name and library id, so the recipient can match their own. */
export interface SharedExercise {
  name: string;
  catalogId?: string;
  kind: Exercise['kind'];
  muscleGroup?: string;
  equipment?: string;
}

export interface SharedWorkout {
  name: string;
  notes?: string;
  exercises: (SharedExercise & { targetSets: number; targetReps: string; notes?: string; supersetNext?: boolean })[];
}

/** What a share link carries: one workout, or a routine with its workouts and planned days. No history. */
export interface SharePayload {
  v: 1;
  routine?: { name: string; days?: number[][]; every?: (number | null)[]; rotateEvery?: number };
  workouts: SharedWorkout[];
}

export function shareableWorkout(workout: Workout, exerciseById: Map<string, Exercise>): SharedWorkout {
  const slots = workout.exercises;
  const kept = slots.map((slot) => exerciseById.has(slot.exerciseId));
  // A slot whose exercise is gone is left out; the one before it stays linked only if the chain ran through it, so
  // A + (missing) + C stays a superset but A, then (missing) + C doesn't become one.
  const linked = (i: number) => {
    for (let j = i; j < slots.length - 1; j++) {
      if (!slots[j].supersetNext) return false;
      if (kept[j + 1]) return true;
    }
    return false;
  };
  return {
    name: workout.name,
    notes: workout.notes || undefined,
    exercises: slots.flatMap((slot, i) => {
      const e = exerciseById.get(slot.exerciseId);
      if (!e) return [];
      return [
        {
          name: e.name,
          catalogId: e.catalogId,
          kind: e.kind,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          targetSets: slot.targetSets,
          targetReps: slot.targetReps,
          notes: slot.notes || undefined,
          supersetNext: linked(i) || undefined,
        },
      ];
    }),
  };
}

export function routinePayload(routine: Routine, workouts: Workout[], exerciseById: Map<string, Exercise>): SharePayload {
  const included = routine.workoutIds.map((id) => workouts.find((w) => w.id === id)).filter((w): w is Workout => !!w);
  return {
    v: 1,
    routine: {
      name: routine.name,
      days: included.map((w) => routine.days?.[w.id] ?? []),
      ...(routine.rotateEvery ? { rotateEvery: routine.rotateEvery } : {}),
      ...(included.some((w) => routine.every?.[w.id]) ? { every: included.map((w) => routine.every?.[w.id] ?? null) } : {}),
    },
    workouts: included.map((w) => shareableWorkout(w, exerciseById)),
  };
}

// The payload rides in the URL fragment (never sent to a server). Links are "2." + URL-safe base64 of the payload in a
// compact form (arrays, short keys, defaults left out), deflated: about a sixth of the original length (a 3-workout
// routine went from ~3,200 characters to ~530). The original form (version 1: plain JSON in base64) still opens. The
// compression is fflate's synchronous one: building the link must not wait, or iOS no longer opens the share sheet
// from the tap.

/** One exercise in a link: name, sets, reps, then (if any) its library id (0 for none) and the rest. */
type CompactExercise = [name: string, sets: number, reps: string, catalogId?: string | 0, more?: CompactMore];
interface CompactMore {
  /** Bodyweight. */
  k?: 1;
  g?: string;
  q?: string;
  o?: string;
  /** Linked to the next as a superset. */
  s?: 1;
}
interface CompactPayload {
  r?: { n: string; d?: number[][]; e?: (number | null)[]; t?: number };
  w: { n: string; o?: string; x: CompactExercise[] }[];
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function compact(payload: SharePayload): CompactPayload {
  const r = payload.routine;
  return {
    ...(r
      ? {
          r: {
            n: r.name,
            ...(r.days?.some((d) => d.length) ? { d: r.days } : {}),
            ...(r.every ? { e: r.every } : {}),
            ...(r.rotateEvery ? { t: r.rotateEvery } : {}),
          },
        }
      : {}),
    w: payload.workouts.map((w) => ({
      n: w.name,
      ...(w.notes ? { o: w.notes } : {}),
      x: w.exercises.map((e): CompactExercise => {
        const more: CompactMore = {
          ...(e.kind === 'bodyweight' ? { k: 1 as const } : {}),
          // A library exercise's group and equipment are looked up when it's added (data/shared.ts), not sent.
          ...(e.muscleGroup && !e.catalogId ? { g: e.muscleGroup } : {}),
          ...(e.equipment && !e.catalogId ? { q: e.equipment } : {}),
          ...(e.notes ? { o: e.notes } : {}),
          ...(e.supersetNext ? { s: 1 as const } : {}),
        };
        const hasMore = Object.keys(more).length > 0;
        const head: CompactExercise = [e.name, e.targetSets, e.targetReps];
        if (e.catalogId || hasMore) head.push(e.catalogId || 0);
        if (hasMore) head.push(more);
        return head;
      }),
    })),
  };
}

function expand(c: CompactPayload): SharePayload {
  return {
    v: 1,
    ...(c.r ? { routine: { name: c.r.n, days: c.r.d ?? c.w.map(() => []), ...(c.r.e ? { every: c.r.e } : {}), ...(c.r.t ? { rotateEvery: c.r.t } : {}) } } : {}),
    workouts: c.w.map((w) => ({
      name: w.n,
      ...(w.o ? { notes: w.o } : {}),
      exercises: w.x.map(([name, targetSets, targetReps, catalogId, more = {}]) => ({
        name,
        targetSets,
        targetReps,
        kind: more.k ? ('bodyweight' as const) : ('weighted' as const),
        ...(catalogId ? { catalogId } : {}),
        ...(more.g ? { muscleGroup: more.g } : {}),
        ...(more.q ? { equipment: more.q } : {}),
        ...(more.o ? { notes: more.o } : {}),
        ...(more.s ? { supersetNext: true } : {}),
      })),
    })),
  };
}

export function encodeShare(payload: SharePayload): string {
  return `2.${toBase64Url(deflateSync(strToU8(JSON.stringify(compact(payload))), { level: 9 }))}`;
}

/** The payload from a link (either version), or null if it's damaged or not one of ours. */
export function decodeShare(encoded: string): SharePayload | null {
  try {
    const payload = encoded.startsWith('2.')
      ? expand(JSON.parse(strFromU8(inflateSync(fromBase64Url(encoded.slice(2))))) as CompactPayload)
      : (JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SharePayload);
    return validPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validPayload(payload: SharePayload): boolean {
  const optional = (v: unknown, type: 'string' | 'number') => v === undefined || v === null || typeof v === type;
  return (
    payload?.v === 1 &&
    Array.isArray(payload.workouts) &&
    payload.workouts.length > 0 &&
    payload.workouts.every(
      (w) =>
        typeof w?.name === 'string' &&
        optional(w.notes, 'string') &&
        Array.isArray(w.exercises) &&
        w.exercises.every(
          (e) =>
            typeof e?.name === 'string' &&
            optional(e.notes, 'string') &&
            optional(e.targetReps, 'string') &&
            optional(e.targetSets, 'number') &&
            optional(e.catalogId, 'string'),
        ),
    ) &&
    (payload.routine === undefined ||
      (typeof payload.routine?.name === 'string' &&
        (payload.routine.days === undefined || (Array.isArray(payload.routine.days) && payload.routine.days.every((d) => Array.isArray(d))))))
  );
}

export function shareUrl(payload: SharePayload, origin: string): string {
  return `${origin}/share#${encodeShare(payload)}`;
}
