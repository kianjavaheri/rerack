// Compound (several joints: squats, presses, rows) or isolation (one joint: curls, raises), for default rest lengths.

/** Names that are one-joint lifts, for exercises that aren't from the library. */
const ISOLATION_WORDS =
  /\b(curls?|raises?|fly|flyes?|flys|extensions?|pushdowns?|push-downs?|kickbacks?|crunch(es)?|calf|calves|shrugs?|pec deck|pullovers?|face pulls?|wrist|leg curl|abduct|adduct|sit-?ups?|plank)\b/i;

/** Equipment choices in the exercise form, as the library spells them (`Exercise.equipment`). */
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'other'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** What an exercise is done with, guessed from its name when it has no `equipment` (one you named yourself). */
export function guessEquipment(name: string): Equipment {
  const n = name.toLowerCase();
  if (/dumbbell|\bdb\b/.test(n)) return 'dumbbell';
  if (/machine|smith|leg press|hack squat|pec deck/.test(n)) return 'machine';
  if (/cable|pushdown|push-down|face pull|pulldown|pull-down/.test(n)) return 'cable';
  if (/goblet|kettlebell|band/.test(n)) return 'other';
  if (/barbell|\bbb\b|squat|deadlift|bench press|overhead press|military press|barbell row|pendlay|hip thrust|clean|snatch/.test(n)) return 'barbell';
  return 'other';
}

/** The equipment an exercise is shown with in its form: its own (a library value outside the choices is Other), else the guess. */
export function equipmentOf(exercise: { name: string; equipment?: string }): Equipment {
  const own = exercise.equipment?.toLowerCase();
  if (own) return (EQUIPMENT as readonly string[]).includes(own) ? (own as Equipment) : 'other';
  return guessEquipment(exercise.name);
}

/**
 * True for an isolation lift: the library's own label when it's a library exercise (`isolation`), else guessed from
 * the name. Anything else counts as compound.
 */
export function isIsolationLift(name: string, library?: { isolation?: true }): boolean {
  if (library) return !!library.isolation;
  return ISOLATION_WORDS.test(name);
}
