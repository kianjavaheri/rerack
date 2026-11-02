import type { BodyWeight, WeightUnit } from './types';

/** The list with this day's weight set (replacing one already logged that day), oldest first. */
export function withWeight(list: BodyWeight[] | undefined, date: string, kg: number): BodyWeight[] {
  return [...(list ?? []).filter((w) => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date));
}

export const withoutWeight = (list: BodyWeight[] | undefined, date: string) => (list ?? []).filter((w) => w.date !== date);

/** Height for display: feet and inches with pounds, centimetres with kilograms. */
export function formatHeight(cm: number | undefined, unit: WeightUnit): string {
  if (!cm) return '';
  if (unit === 'kg') return `${Math.round(cm)} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export const feetInches = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return { ft: Math.floor(inches / 12), in: inches % 12 };
};

export const fromFeetInches = (ft: number, inches: number) => (ft * 12 + inches) * 2.54;

/** Change from the first weight logged in the last `days` days (or ever) to the latest, in kg. */
export function weightChange(list: BodyWeight[], days = Infinity): number | null {
  if (list.length < 2) return null;
  const latest = list[list.length - 1];
  const since = days === Infinity ? '' : dayString(new Date(Date.parse(`${latest.date}T12:00:00`) - days * 86_400_000));
  const first = list.find((w) => w.date >= since);
  return first && first !== latest ? latest.kg - first.kg : null;
}

/** A Date as the local YYYY-MM-DD. */
export function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
