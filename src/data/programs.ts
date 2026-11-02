import type { SharePayload } from '../core/share';
import type { ID } from '../core/types';
import { now } from '../core/ids';
import { repo } from '.';
import { loadCatalog } from './catalog';
import { addShared } from './shared';

/** One slot: the name it's added under, its library entry (pictures, instructions, matching yours), sets and reps. */
type Slot = [name: string, catalogId: string, sets: number, reps: string];

interface ProgramWorkout {
  name: string;
  /** Days of the week it's planned on (0 = Sun), as in `Routine.days`. */
  days?: number[];
  exercises: Slot[];
}

/** A ready-made routine to start from: added like a shared routine (`addShared`), then yours to change. */
export interface Program {
  id: string;
  name: string;
  /** "3 days a week · Beginner" */
  summary: string;
  description: string;
  /** One workout every N days, in order, when it isn't planned on weekdays (`Routine.rotateEvery`). */
  rotateEvery?: number;
  workouts: ProgramWorkout[];
}

/**
 * Common, generic programs (no branded ones). Working sets only; rep ranges follow what each is for: strength work
 * lower, accessories higher. Days are spread so no muscle is trained two days running.
 */
export const PROGRAMS: Program[] = [
  {
    id: 'beginner-strength',
    name: 'Beginner Strength',
    summary: '3 days a week · Beginner',
    description: 'Two short barbell workouts, alternated. Add a little weight each time you hit every rep.',
    rotateEvery: 2,
    workouts: [
      {
        name: 'Strength A',
        exercises: [
          ['Back Squat', 'Barbell_Squat', 5, '5'],
          ['Bench Press', 'Barbell_Bench_Press_-_Medium_Grip', 5, '5'],
          ['Barbell Row', 'Bent_Over_Barbell_Row', 5, '5'],
        ],
      },
      {
        name: 'Strength B',
        exercises: [
          ['Back Squat', 'Barbell_Squat', 5, '5'],
          ['Overhead Press', 'Standing_Military_Press', 5, '5'],
          ['Deadlift', 'Barbell_Deadlift', 1, '5'],
        ],
      },
    ],
  },
  {
    id: 'full-body-machines',
    name: 'Full Body Starter',
    summary: '3 days a week · New to the gym',
    description: 'Machines and dumbbells, easy to learn and set up. Every muscle, three times a week.',
    workouts: [
      {
        name: 'Full Body A',
        days: [1, 5],
        exercises: [
          ['Leg Press', 'Leg_Press', 3, '10-12'],
          ['Machine Chest Press', 'Leverage_Chest_Press', 3, '10-12'],
          ['Lat Pulldown', 'Wide-Grip_Lat_Pulldown', 3, '10-12'],
          ['Dumbbell Shoulder Press', 'Dumbbell_Shoulder_Press', 2, '10-12'],
          ['Seated Leg Curl', 'Seated_Leg_Curl', 2, '10-15'],
          ['Cable Crunch', 'Cable_Crunch', 2, '12-15'],
        ],
      },
      {
        name: 'Full Body B',
        days: [3],
        exercises: [
          ['Goblet Squat', 'Goblet_Squat', 3, '10-12'],
          ['Dumbbell Bench Press', 'Dumbbell_Bench_Press', 3, '10-12'],
          ['Seated Cable Row', 'Seated_Cable_Rows', 3, '10-12'],
          ['Lateral Raise', 'Side_Lateral_Raise', 2, '12-15'],
          ['Bicep Curl', 'Dumbbell_Bicep_Curl', 2, '10-12'],
          ['Tricep Pushdown', 'Triceps_Pushdown', 2, '10-12'],
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    summary: '4 days a week · Intermediate',
    description: 'Upper body one day, lower body the next, each twice a week: a heavier day and a lighter one.',
    workouts: [
      {
        name: 'Upper A',
        days: [1],
        exercises: [
          ['Bench Press', 'Barbell_Bench_Press_-_Medium_Grip', 4, '5-8'],
          ['Barbell Row', 'Bent_Over_Barbell_Row', 4, '6-8'],
          ['Overhead Press', 'Standing_Military_Press', 3, '6-10'],
          ['Lat Pulldown', 'Wide-Grip_Lat_Pulldown', 3, '8-12'],
          ['Bicep Curl', 'Dumbbell_Bicep_Curl', 2, '10-12'],
          ['Tricep Pushdown', 'Triceps_Pushdown', 2, '10-12'],
        ],
      },
      {
        name: 'Lower A',
        days: [2],
        exercises: [
          ['Back Squat', 'Barbell_Squat', 4, '5-8'],
          ['Romanian Deadlift', 'Romanian_Deadlift', 3, '8-10'],
          ['Leg Press', 'Leg_Press', 3, '10-12'],
          ['Lying Leg Curl', 'Lying_Leg_Curls', 3, '10-12'],
          ['Standing Calf Raise', 'Standing_Calf_Raises', 3, '10-15'],
        ],
      },
      {
        name: 'Upper B',
        days: [4],
        exercises: [
          ['Incline Dumbbell Press', 'Incline_Dumbbell_Press', 3, '8-12'],
          ['Pull-up', 'Pullups', 3, '6-10'],
          ['Dumbbell Shoulder Press', 'Dumbbell_Shoulder_Press', 3, '8-12'],
          ['Seated Cable Row', 'Seated_Cable_Rows', 3, '10-12'],
          ['Lateral Raise', 'Side_Lateral_Raise', 3, '12-15'],
          ['Hammer Curl', 'Hammer_Curls', 2, '10-12'],
        ],
      },
      {
        name: 'Lower B',
        days: [5],
        exercises: [
          ['Deadlift', 'Barbell_Deadlift', 3, '4-6'],
          ['Front Squat', 'Front_Barbell_Squat', 3, '6-8'],
          ['Walking Lunge', 'Dumbbell_Lunges', 3, '10-12'],
          ['Leg Extension', 'Leg_Extensions', 3, '12-15'],
          ['Seated Calf Raise', 'Seated_Calf_Raise', 3, '12-15'],
        ],
      },
    ],
  },
  {
    id: 'push-pull-legs',
    name: 'Push / Pull / Legs',
    summary: '6 days a week · Intermediate',
    description: 'Pressing, pulling and legs, each twice a week. Do it three days a week if six is too many.',
    workouts: [
      {
        name: 'Push',
        days: [1, 4],
        exercises: [
          ['Bench Press', 'Barbell_Bench_Press_-_Medium_Grip', 4, '6-8'],
          ['Overhead Press', 'Standing_Military_Press', 3, '8-10'],
          ['Incline Dumbbell Press', 'Incline_Dumbbell_Press', 3, '8-12'],
          ['Lateral Raise', 'Side_Lateral_Raise', 3, '12-15'],
          ['Tricep Pushdown', 'Triceps_Pushdown', 3, '10-12'],
          ['Overhead Tricep Extension', 'Cable_Rope_Overhead_Triceps_Extension', 2, '10-12'],
        ],
      },
      {
        name: 'Pull',
        days: [2, 5],
        exercises: [
          ['Pull-up', 'Pullups', 3, '6-10'],
          ['Barbell Row', 'Bent_Over_Barbell_Row', 3, '6-8'],
          ['Lat Pulldown', 'Wide-Grip_Lat_Pulldown', 3, '10-12'],
          ['Face Pull', 'Face_Pull', 3, '12-15'],
          ['Bicep Curl', 'Dumbbell_Bicep_Curl', 3, '10-12'],
          ['Hammer Curl', 'Hammer_Curls', 2, '10-12'],
        ],
      },
      {
        name: 'Legs',
        days: [3, 6],
        exercises: [
          ['Back Squat', 'Barbell_Squat', 4, '6-8'],
          ['Romanian Deadlift', 'Romanian_Deadlift', 3, '8-10'],
          ['Leg Press', 'Leg_Press', 3, '10-12'],
          ['Lying Leg Curl', 'Lying_Leg_Curls', 3, '10-12'],
          ['Standing Calf Raise', 'Standing_Calf_Raises', 4, '10-15'],
        ],
      },
    ],
  },
  {
    id: 'body-part-split',
    name: 'Body Part Split',
    summary: '5 days a week · Intermediate',
    description: 'One or two muscle groups a day with lots of sets for each, Monday to Friday.',
    workouts: [
      {
        name: 'Chest',
        days: [1],
        exercises: [
          ['Bench Press', 'Barbell_Bench_Press_-_Medium_Grip', 4, '6-10'],
          ['Incline Dumbbell Press', 'Incline_Dumbbell_Press', 3, '8-12'],
          ['Dumbbell Fly', 'Dumbbell_Flyes', 3, '10-12'],
          ['Cable Crossover', 'Cable_Crossover', 3, '12-15'],
          ['Dip', 'Dips_-_Chest_Version', 2, '8-12'],
        ],
      },
      {
        name: 'Back',
        days: [2],
        exercises: [
          ['Deadlift', 'Barbell_Deadlift', 3, '4-6'],
          ['Pull-up', 'Pullups', 3, '6-10'],
          ['Barbell Row', 'Bent_Over_Barbell_Row', 3, '8-10'],
          ['Seated Cable Row', 'Seated_Cable_Rows', 3, '10-12'],
          ['One-Arm Dumbbell Row', 'One-Arm_Dumbbell_Row', 3, '10-12'],
        ],
      },
      {
        name: 'Shoulders',
        days: [3],
        exercises: [
          ['Overhead Press', 'Standing_Military_Press', 4, '6-10'],
          ['Lateral Raise', 'Side_Lateral_Raise', 4, '12-15'],
          ['Reverse Fly', 'Reverse_Flyes', 3, '12-15'],
          ['Face Pull', 'Face_Pull', 3, '12-15'],
          ['Shrug', 'Barbell_Shrug', 3, '10-12'],
        ],
      },
      {
        name: 'Legs',
        days: [4],
        exercises: [
          ['Back Squat', 'Barbell_Squat', 4, '6-10'],
          ['Leg Press', 'Leg_Press', 3, '10-12'],
          ['Romanian Deadlift', 'Romanian_Deadlift', 3, '8-10'],
          ['Leg Extension', 'Leg_Extensions', 3, '12-15'],
          ['Lying Leg Curl', 'Lying_Leg_Curls', 3, '10-12'],
          ['Standing Calf Raise', 'Standing_Calf_Raises', 4, '10-15'],
        ],
      },
      {
        name: 'Arms',
        days: [5],
        exercises: [
          ['Barbell Curl', 'Barbell_Curl', 3, '8-12'],
          ['Close-Grip Bench Press', 'Close-Grip_Barbell_Bench_Press', 3, '8-10'],
          ['Hammer Curl', 'Hammer_Curls', 3, '10-12'],
          ['Tricep Pushdown', 'Triceps_Pushdown', 3, '10-12'],
          ['Incline Hammer Curl', 'Incline_Hammer_Curls', 2, '10-12'],
          ['Overhead Tricep Extension', 'Cable_Rope_Overhead_Triceps_Extension', 2, '10-12'],
        ],
      },
    ],
  },
];

/**
 * Adds a program as a routine with its workouts and planned days. Exercises join yours (one you already have from the
 * same library entry, or with the same name, is reused), carrying the library's kind, muscle group and equipment.
 */
export async function addProgram(program: Program): Promise<AddedProgram> {
  const catalog = await loadCatalog();
  const had = new Set((await repo.listExercises()).map((e) => e.id));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const payload: SharePayload = {
    v: 1,
    routine: {
      name: program.name,
      days: program.workouts.map((w) => w.days ?? []),
      ...(program.rotateEvery ? { rotateEvery: program.rotateEvery } : {}),
    },
    workouts: program.workouts.map((w) => ({
      name: w.name,
      exercises: w.exercises.map(([name, catalogId, targetSets, targetReps]) => {
        const entry = byId.get(catalogId);
        return { name, catalogId, kind: entry?.kind ?? 'weighted', muscleGroup: entry?.muscleGroup, equipment: entry?.equipment, targetSets, targetReps };
      }),
    })),
  };
  const added = await addShared(payload);
  const exerciseIds = (await repo.listExercises()).filter((e) => !had.has(e.id)).map((e) => e.id);
  return { routineId: added.routineId!, workoutIds: added.workoutIds, exerciseIds };
}

export interface AddedProgram {
  routineId: ID;
  workoutIds: ID[];
  /** Exercises it created (ones you already had were reused). */
  exerciseIds: ID[];
}

/** Undo for `addProgram`: removes its routine and workouts, and archives the exercises it made (nothing's logged yet). */
export async function removeProgram(added: AddedProgram): Promise<void> {
  await repo.deleteRoutine(added.routineId);
  for (const id of added.workoutIds) await repo.deleteWorkout(id);
  const made = new Set(added.exerciseIds);
  for (const exercise of await repo.listExercises()) {
    if (made.has(exercise.id)) await repo.saveExercise({ ...exercise, archived: true, updatedAt: now() });
  }
}
