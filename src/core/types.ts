// Domain model. Plain serializable data only (no classes, no Dates) so the same
// shapes can be stored in IndexedDB today and synced to a backend / native app later.

export type ID = string;
/** ISO-8601 timestamp string. */
export type Timestamp = string;

export type WeightUnit = 'lb' | 'kg';
/** 'bamboo' is a light theme on a warm off-white page. */
export type ThemePreference = 'system' | 'light' | 'dark' | 'bamboo';

/** How an exercise is measured. Bodyweight exercises allow an optional added load. */
export type ExerciseKind = 'weighted' | 'bodyweight';

export interface Exercise {
  id: ID;
  name: string;
  kind: ExerciseKind;
  muscleGroup?: string;
  /**
   * e.g. "barbell", "dumbbell", "cable": from the library, or chosen in the exercise form. Barbell gives Per side and
   * the plate list. Missing: guessed from the name (`guessEquipment`).
   */
  equipment?: string;
  /** free-exercise-db id when added from the built-in library, so it isn't added twice. */
  catalogId?: string;
  /** Sticky note shown whenever this exercise is logged (form cues, seat height…). */
  notes?: string;
  /** Reference links (form videos, articles). http(s) only — see `normalizeLink`. */
  links?: string[];
  /**
   * Rest after a set of this exercise, in seconds, wherever it's done; 0 = no automatic rest. Missing: the default in
   * Settings (`restSecondsFor`).
   */
  restSeconds?: number;
  /**
   * Compound (false) or isolation (true), chosen in the exercise form; sets which default rest it gets. Missing: the
   * library's label, else guessed from the name (`useIsIsolation`).
   */
  isolation?: boolean;
  /** Barbell lifts: what the bar weighs, in kg (a 35 lb or EZ bar). Missing: the standard 45 lb / 20 kg (`barWeight`). */
  barKg?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Soft delete so historic sessions keep their references. */
  archived?: boolean;
}

/** An exercise slot inside a workout template. */
export interface WorkoutExercise {
  id: ID;
  exerciseId: ID;
  targetSets: number;
  /** Free-form so "8-12" or "AMRAP" both work. */
  targetReps: string;
  notes?: string;
  /** Done as a superset with the next exercise (alternate sets, rest after the last one). Chains for 3+. */
  supersetNext?: boolean;
}

/** A reusable workout template, e.g. "Push Day". May stand alone or belong to routines. */
export interface Workout {
  id: ID;
  name: string;
  exercises: WorkoutExercise[];
  /** Sticky note shown whenever this workout is logged. */
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** An ordered collection of workouts, e.g. "Push / Pull / Legs". */
export interface Routine {
  id: ID;
  name: string;
  workoutIds: ID[];
  /** Optional weekdays (0 = Sunday … 6 = Saturday) each workout is planned for. */
  days?: Record<ID, number[]>;
  /** A workout planned every N days from when it was last done, in place of its weekdays. */
  every?: Record<ID, number>;
  /** The routine in rotation: one workout every N days, in order (2: Push, rest, Pull, rest…). Overrides the above. */
  rotateEvery?: number;
  /**
   * Workouts that are optional in this routine: still shown on their planned days, but never counted as planned or
   * missed, not reminded about, and skipped by "Up next". Per routine, so a workout can be optional in one only.
   */
  optional?: Record<ID, boolean>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SetLog {
  id: ID;
  reps: number | null;
  /** Always stored in kilograms; converted at the UI edge. */
  weightKg: number | null;
  done: boolean;
  /** A warm-up set: shown and checked off like any set, but left out of stats, "Previous" and totals. */
  warmup?: boolean;
  /**
   * A drop set: straight after the set above at a lower weight. Counts like any working set (stats, records, totals)
   * but shows as "D" and doesn't take a set number.
   */
  drop?: boolean;
  /** When it was checked off (cleared when unchecked): which exercise you're on, and when an exercise was finished. */
  doneAt?: Timestamp;
  right?: SideLog | null;
}

export interface SideLog {
  reps: number | null;
  weightKg: number | null;
}

export interface SessionEntry {
  id: ID;
  exerciseId: ID;
  /** Barbell lifts: weight is typed per side of the bar in this workout (`formatPerSide`); the total is what's stored. */
  perSide?: boolean;
  sides?: boolean;
  sets: SetLog[];
  /** Carried over from the template, if any, for display while logging. */
  targetSets?: number;
  targetReps?: string;
  notes?: string;
  /** Copied from the workout: a superset with the next entry. */
  supersetNext?: boolean;
}

/** A single gym visit ("check-in"). Either follows a workout template or is freestyle. */
export interface Session {
  id: ID;
  name: string;
  /** Template that seeded this session, or null for a freestyle log. */
  workoutId: ID | null;
  /** Routine the workout was picked from, used to suggest the next workout. */
  routineId: ID | null;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  /** False when logged after the fact (no live timer or duration). Missing means live. */
  live?: boolean;
  /**
   * Duration typed in by hand, in minutes. Missing: worked out from the timer (live sessions) or none (logged after
   * the fact). null: deliberately cleared, so no duration is shown. Use `sessionDurationMinutes`.
   */
  durationMinutes?: number | null;
  /** When the current rest (started by checking off a set) ends. Saved with the session so it survives a reload. */
  restEndsAt?: Timestamp | null;
  /** Length of the last rest started (the exercise's own), which the bar's Start and Again reuse. */
  restLength?: number;
  /** The exercise whose set started the rest under way: changing that exercise's rest length adjusts it. */
  restExerciseId?: ID | null;
  /** The rest under way was paused with this many seconds left (`restEndsAt` is null meanwhile); Resume restarts it. */
  restPausedLeft?: number | null;
  /**
   * Old: the rest bar used to have a × that hid it and stopped sets starting rests. Nothing sets it now; a rest started
   * on the phone clears it (the watch still honours it).
   */
  restHidden?: boolean;
  /** "Keep going" on the forgotten-workout prompt: delays the next prompt without changing `lastActivityAt`. */
  snoozedAt?: Timestamp;
  /** Last time anything in the session changed; spots a workout left open by mistake. See `forgottenSession`. */
  lastActivityAt?: Timestamp;
  /**
   * A Log-only record, not a workout: numbers from "Import from notes" or typed into the Log. They fill the Log, Last
   * and the placeholders, and nothing that lists or counts workouts shows them (Recent, History, Analytics, activity).
   * Use `isImportedSession`.
   */
  imported?: boolean;
  /** A Log-only record with a real date typed in; otherwise its `startedAt` is a placeholder (`isUndatedSession`). */
  dated?: boolean;
  /**
   * A finished workout picked back up (`resumeSession`): how it was, so cancelling puts it back instead of deleting a
   * workout that was already logged. Dropped when it's finished again.
   */
  resumedFrom?: { finishedAt: Timestamp; durationMinutes?: number | null; entries: SessionEntry[] };
  /**
   * Finished on the Apple Watch, which saved it to Apple Health itself (with heart rate): the phone never saves its own
   * copy (`saveToAppleHealth`), so it isn't there twice.
   */
  savedByWatch?: boolean;
  entries: SessionEntry[];
  notes?: string;
}

export interface Settings {
  unit: WeightUnit;
  theme: ThemePreference;
  /**
   * The accent (Settings → Appearance, `core/accents.ts`): a premade one's id ('classic', 'purple', 'pink'…) or a
   * custom colour ("#3fa9f5"). Missing: the old switches below, else classic (`accentOf`).
   */
  accent?: string;
  /**
   * Old, replaced by `accent` (still read by `accentOf`): dark mode's accent: 'purple' swaps the warm sweep (orange, salmon, red) for a pink-to-violet-to-blue
   * one. Missing = warm. Light mode is unaffected. Set in Settings → Appearance.
   */
  darkAccent?: 'purple' | null;
  /**
   * Old, replaced by `accent`: one plain accent instead of the colours, black in light mode and white in dark (overrides
   * `darkAccent`). Set in Settings → Appearance.
   */
  monoAccent?: boolean;
  /** Old, replaced by `accent`: pink in both themes, deeper in light mode and lighter in dark (overrides `darkAccent`; off while `monoAccent` is on). */
  pinkAccent?: boolean;
  /**
   * iPhone app: the home-screen icon follows the accent and theme (`appIconFor`). Missing: off (the usual icon),
   * since iOS shows a notice every time an app changes its icon.
   */
  appIconMatches?: boolean;
  /** The routine being followed: drives "Up next", planned days and check-in badges. See `followedRoutine`. */
  activeRoutineId?: ID | null;
  /** Rest length in seconds, started by checking off a set; 0 = only when started by hand (then 2:00). Missing: `DEFAULT_REST_SECONDS`. */
  restSeconds?: number;
  /** Default rest for isolation lifts (curls, raises; `isIsolationLift`). Missing: the same as `restSeconds`. */
  restIsolationSeconds?: number;
  /** true: checking off an exercise's last set starts a rest too. Missing: no rest then (on to the next exercise). */
  restAfterLastSet?: boolean;
  /** false: no rest timer at all (no bar, no rest lengths on exercises, nothing starts). Missing: on. */
  restTimer?: boolean;
  /** true: a Per side weight shows as its plates while not being typed in ("45 + 25" for 70 a side). Missing: off. */
  perSidePlates?: boolean;
  /** false: no "Go up to…" suggestions while logging. Missing: on. */
  weightSuggestions?: boolean;
  /**
   * How much one turn of the Apple Watch's Crown changes a set's weight, per display unit (any amount, e.g. 2.5 lb).
   * Missing: `DEFAULT_WEIGHT_STEP` (5 lb / 2.5 kg).
   */
  weightStep?: Partial<Record<WeightUnit, number>>;
  /** Keep the screen on while a live workout is open (Settings' switch); missing = on. */
  keepAwake?: boolean;
  /** The first-run intro (components/Intro.tsx) was finished or skipped. Synced, so it shows once per account. */
  introDone?: boolean;
  /** What you've told the app about yourself (Settings → Profile). Name and photo override the sign-in's. */
  profile?: Profile;
  /** Body weight over time, oldest first, one per day (`core/body.ts`). */
  bodyWeights?: BodyWeight[];
  /** Which notifications the app may send (`core/notifications.ts`). Missing: not chosen yet (rest alerts only). */
  notifications?: NotificationSettings;
}

export type NotificationKind = 'rest' | 'reminders' | 'open';

export interface NotificationSettings {
  mode: 'all' | 'none' | 'choose';
  /** With `choose`: which kinds are on (missing = off). */
  kinds?: Partial<Record<NotificationKind, boolean>>;
  /** Workout reminders' time of day, "HH:MM" (24 h). Missing: `DEFAULT_REMINDER_AT`. */
  reminderAt?: string;
}

export interface Profile {
  name?: string;
  /** A small square JPEG as a data URL (~20 KB), so it syncs with settings. */
  photo?: string;
  heightCm?: number;
}

export interface BodyWeight {
  /** Local day, YYYY-MM-DD. */
  date: string;
  kg: number;
}

export const DEFAULT_SETTINGS: Settings = { unit: 'lb', theme: 'system' };
export const DEFAULT_REST_SECONDS = 120;
export const DEFAULT_WEIGHT_STEP: Record<WeightUnit, number> = { lb: 5, kg: 2.5 };

/** The Crown's weight step on the Apple Watch, in the display unit. */
export const weightStepFor = (settings: Settings) => {
  const step = settings.weightStep?.[settings.unit];
  return step && step > 0 ? step : DEFAULT_WEIGHT_STEP[settings.unit];
};

/** The Settings default rest for a compound lift, or an isolation one (which falls back to the compound length). */
export const defaultRestSeconds = (settings: Settings, isolation = false) =>
  (isolation ? settings.restIsolationSeconds : undefined) ?? settings.restSeconds ?? DEFAULT_REST_SECONDS;

/** Rest after a set of this exercise: its own length if set, else the Settings default for its kind of lift. */
export const restSecondsFor = (exercise: Exercise | undefined, settings: Settings, isolation = false) =>
  exercise?.restSeconds ?? defaultRestSeconds(settings, isolation);

/** Whole-database snapshot used for export / import and future cloud sync. */
export interface Snapshot {
  version: 1;
  exportedAt: Timestamp;
  exercises: Exercise[];
  workouts: Workout[];
  routines: Routine[];
  sessions: Session[];
  settings: Settings;
}
