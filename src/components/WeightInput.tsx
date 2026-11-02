import { formatPerSide, parsePerSide } from '../core/plates';
import type { WeightUnit } from '../core/types';
import { formatWeight, parseWeightInput } from '../core/units';
import { NumericInput } from './NumericInput';

/**
 * A weight field. Normally the total. With `perSide` (barbell lifts with that on) you type one side of the bar, and
 * the total shows beside it in small print: 35 → "= 115 lb". What you load is what's big; the total is what's stored.
 */
export function WeightInput({
  value,
  hintKg,
  emptyPlaceholder,
  unit,
  perSide,
  bar,
  ariaLabel,
  className,
  onChange,
}: {
  value: number | null;
  /** Suggested weight, shown as the placeholder. */
  hintKg?: number | null;
  /** Placeholder without a suggestion. */
  emptyPlaceholder: string;
  unit: WeightUnit;
  perSide: boolean;
  /** The bar's weight in the display unit, for per-side entry (`barWeight`); the standard bar if left out. */
  bar?: number;
  ariaLabel: string;
  className?: string;
  onChange: (kg: number | null) => void;
}) {
  const shown = value ?? hintKg ?? null;
  return (
    <div className="affix">
      <NumericInput
        // The typed text is kept while focused, so switching what it means starts it afresh.
        key={perSide ? `side-${bar}` : 'total'}
        className={className}
        decimal
        ariaLabel={perSide ? `${ariaLabel} per side, in ${unit}` : `${ariaLabel} in ${unit}`}
        value={value}
        placeholder={hintKg != null ? (perSide ? formatPerSide(hintKg, unit, bar) : formatWeight(hintKg, unit)) : emptyPlaceholder}
        format={(v) => (v == null ? '' : perSide ? formatPerSide(v, unit, bar) : formatWeight(v, unit))}
        parse={(t) => (perSide ? parsePerSide(t, unit, bar) : parseWeightInput(t, unit))}
        onChange={onChange}
      />
      <span className={`suffix${perSide && shown != null ? ' total' : ''}`}>{perSide && shown != null ? `= ${formatWeight(shown, unit)} ${unit}` : unit}</span>
    </div>
  );
}
