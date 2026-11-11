import type { Exercise, WeightUnit } from './types';
import { guessEquipment } from './lifts';
import { fromKg, toKg } from './units';

/** Standard bar and plates per unit. */
const BAR: Record<WeightUnit, number> = { lb: 45, kg: 20 };
/** Bars offered in the set menu: Olympic, women's, EZ/fixed, technique. */
export const BAR_CHOICES: Record<WeightUnit, number[]> = { lb: [45, 35, 25, 15], kg: [20, 15, 10, 7] };

/** What this exercise's bar weighs in the display unit (`Exercise.barKg`, else the standard bar). */
export function barWeight(exercise: Exercise | undefined, unit: WeightUnit): number {
  if (exercise?.barKg == null) return BAR[unit];
  return Math.round(fromKg(exercise.barKg, unit) * 10) / 10;
}
const PLATES: Record<WeightUnit, number[]> = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };

/**
 * Plates for each side of the bar to make `total` (in the display unit), heaviest first. `exact` is false when
 * standard plates can't make it exactly (the rest is left off). Null below the bar's own weight.
 */
export function platesPerSide(total: number, unit: WeightUnit, bar = BAR[unit]): { plates: number[]; exact: boolean } | null {
  if (!(total >= bar)) return null;
  let side = (total - bar) / 2;
  const plates: number[] = [];
  for (const plate of PLATES[unit]) {
    while (side >= plate - 1e-9) {
      plates.push(plate);
      side -= plate;
    }
  }
  return { plates, exact: side < 1e-6 };
}

/** Readable plate list for a set, e.g. "45 + 25 per side", or null when it doesn't apply. */
export function platesLabel(total: number | null, unit: WeightUnit, bar = BAR[unit]): string | null {
  if (total == null) return null;
  const result = platesPerSide(total, unit, bar);
  if (!result) return null;
  if (result.plates.length === 0) return `Just the ${bar} ${unit} bar`;
  return `${result.exact ? '' : '≈ '}${result.plates.join(' + ')} per side`;
}

/**
 * A per-side weight as the plates that make it, when it takes more than one: 70 lb a side → "45 + 25". Null for one
 * plate or none, or a weight standard plates can't make exactly (then the number reads better).
 */
export function sidePlatesLabel(kg: number | null, unit: WeightUnit, bar = BAR[unit]): string | null {
  if (kg == null) return null;
  const total = Math.round(fromKg(kg, unit) * 10) / 10;
  const result = platesPerSide(total, unit, bar);
  if (!result || !result.exact || result.plates.length < 2) return null;
  // Two read like you'd say them ("45 + 25"); more are packed so they fit in a set's weight field ("45+10+10+2.5").
  return result.plates.join(result.plates.length > 2 ? '+' : ' + ');
}

/**
 * "Per side" entry (`SessionEntry.perSide`): you type what's on one side of the bar and the total (both sides plus the
 * bar) is what's stored, so history, charts and records never change meaning: 35 lb a side is 115 lb. A total lighter
 * than the bar shows as 0.
 */
export function formatPerSide(kg: number | null, unit: WeightUnit, bar = BAR[unit]): string {
  if (kg == null) return '';
  const total = Math.round(fromKg(kg, unit) * 10) / 10;
  return String(Math.max(0, Math.round(((total - bar) / 2) * 100) / 100));
}

export function parsePerSide(text: string, unit: WeightUnit, bar = BAR[unit]): number | null {
  const side = parseFloat(text);
  return Number.isFinite(side) && side >= 0 ? toKg(side * 2 + bar, unit) : null;
}

/** Whether to offer the plate calculator: library barbell exercises, or names that clearly mean a barbell lift. */
export function isBarbellExercise(exercise: Exercise | undefined): boolean {
  if (!exercise || exercise.kind === 'bodyweight') return false;
  if (exercise.equipment) return exercise.equipment.toLowerCase() === 'barbell';
  return guessEquipment(exercise.name) === 'barbell';
}
