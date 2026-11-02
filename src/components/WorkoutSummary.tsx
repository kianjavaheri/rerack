import { ArrowDown, ArrowUp, Maximize2, Minus, Sparkles } from 'lucide-react';
import { formatDuration, formatNumber, relativeDay } from '../core/format';
import type { WorkoutSummary as Summary } from '../core/summary';
import type { Exercise, WeightUnit } from '../core/types';
import { formatWeight, fromKg } from '../core/units';

/** "+3", "−1,200", "same" against last time; null when there's nothing to compare. */
function delta(now: number, then: number | null | undefined, format: (n: number) => string) {
  if (then == null) return null;
  const d = now - then;
  if (Math.abs(d) < 0.5) return { text: 'same', dir: 0 };
  return { text: `${d > 0 ? '+' : '−'}${format(Math.abs(d))}`, dir: d > 0 ? 1 : -1 };
}

/**
 * A finished workout at a glance: time, sets, volume and exercises, each against the last time this workout was done,
 * then each exercise's sets with whether it went up. Shown at the top of every finished workout (so History has it for
 * all of them; `onOpen` adds a button to see it as a page) and as the page itself (`page`, SummaryWindow).
 */
export function WorkoutSummary({
  summary,
  exerciseById,
  unit,
  page,
  onOpen,
}: {
  summary: Summary;
  exerciseById: Map<string, Exercise>;
  unit: WeightUnit;
  page?: boolean;
  onOpen?: () => void;
}) {
  const prev = summary.previous;
  const tiles = [
    { label: 'Time', value: summary.minutes != null ? formatDuration(summary.minutes) : '—', d: summary.minutes != null ? delta(summary.minutes, prev?.minutes, (n) => `${Math.round(n)} min`) : null },
    { label: 'Sets', value: String(summary.sets), d: delta(summary.sets, prev?.sets, (n) => String(Math.round(n))) },
    { label: 'Volume', value: `${formatNumber(fromKg(summary.volumeKg, unit))} ${unit}`, d: delta(fromKg(summary.volumeKg, unit), prev ? fromKg(prev.volumeKg, unit) : null, formatNumber) },
    { label: 'Exercises', value: String(summary.exercises.length), d: null },
  ];
  return (
    <section className={`card workout-summary${page ? ' page' : ''}`}>
      <div className="spread">
        <h2 className="section-title" style={{ margin: 0 }}>
          Summary
        </h2>
        <span className="row" style={{ gap: 8 }}>
          {prev && <span className="muted small">vs {relativeDay(prev.date, true)}</span>}
          {onOpen && (
            <button className="icon-btn summary-open" onClick={onOpen} aria-label="Open the summary" title="Open the summary">
              <Maximize2 size={16} />
            </button>
          )}
        </span>
      </div>
      <div className="summary-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="summary-tile">
            <span className="summary-label">{t.label}</span>
            <span className="summary-value tnum">{t.value}</span>
            {t.d && (
              // Time going up isn't better or worse, so it's never coloured.
              <span className={`summary-delta${t.label !== 'Time' && t.d.dir > 0 ? ' up' : ''}`}>{t.d.text}</span>
            )}
          </div>
        ))}
      </div>
      <div className="summary-exercises">
        {summary.exercises.map((x, i) => {
          const exercise = exerciseById.get(x.exerciseId);
          const bodyweight = exercise?.kind === 'bodyweight';
          return (
            <div key={`${x.exerciseId}-${i}`} className="summary-exercise">
              <span className="summary-name">{exercise?.name ?? 'Exercise'}</span>
              <span className="summary-sets tnum">
                {x.groups.map((g) => `${g.count} × ${g.reps}${g.weightKg ? ` · ${bodyweight ? '+' : ''}${formatWeight(g.weightKg, unit)} ${unit}` : bodyweight ? ' · BW' : ''}`).join(', ')}
              </span>
              <span className={`summary-trend ${x.trend}`} title={{ up: 'Better than last time', down: 'Less than last time', same: 'Same as last time', new: 'First time in this workout' }[x.trend]}>
                {x.trend === 'up' ? <ArrowUp size={14} /> : x.trend === 'down' ? <ArrowDown size={14} /> : x.trend === 'same' ? <Minus size={14} /> : <Sparkles size={13} />}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
