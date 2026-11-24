import type { WeightUnit } from './types';

const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

/** Rounds to 0.1 and drops a trailing ".0". */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '—';
  const v = Math.round(fromKg(kg, unit) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Value to show in an editable input; empty string when unset. */
export function weightInputValue(kg: number | null, unit: WeightUnit): string {
  return kg == null ? '' : formatWeight(kg, unit);
}

export function parseWeightInput(raw: string, unit: WeightUnit): number | null {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? toKg(n, unit) : null;
}

export function setWeightText(kg: number | null | undefined, unit: WeightUnit, bodyweight: boolean): string | null {
  return kg ? `${bodyweight ? '+' : ''}${formatWeight(kg, unit)} ${unit}` : bodyweight ? 'BW' : null;
}

export function setGroupText(
  g: { count: number; reps: number; weightKg: number | null; right?: { reps: number; weightKg: number | null } },
  unit: WeightUnit,
  bodyweight: boolean,
): string {
  const w = setWeightText(g.weightKg, unit, bodyweight);
  if (!g.right) return `${g.count} × ${g.reps}${w ? ` · ${w}` : ''}`;
  const rw = setWeightText(g.right.weightKg ?? g.weightKg, unit, bodyweight);
  if (rw === w) return `${g.count} × L ${g.reps} · R ${g.right.reps}${w ? ` · ${w}` : ''}`;
  return `${g.count} × L ${g.reps}${w ? ` · ${w}` : ''}, R ${g.right.reps}${rw ? ` · ${rw}` : ''}`;
}
