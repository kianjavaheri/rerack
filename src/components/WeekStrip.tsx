import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { addDays, dailyActivity, dayKey, plannedOn, startOfWeek, totalsBetween, type DayActivity } from '../core/activity';
import { pluralize, weekRange } from '../core/format';
import type { Routine, Session, Workout } from '../core/types';
import { usePager } from '../hooks/usePager';
import { useOpenDay } from './DaySessions';

/** How far back the week strip goes (to the first workout, at most this many weeks). */
const MAX_WEEKS = 104;

/** Mon–Sun of one week: filled dot = trained, ring = planned, today highlighted. */
function WeekStrip({
  monday,
  sessions,
  routines,
  workouts,
  openDay,
  activity,
}: {
  monday: Date;
  activity: Map<string, DayActivity>;
  sessions: Session[];
  routines: Routine[];
  workouts: Workout[];
  openDay: ReturnType<typeof useOpenDay>[0];
}) {
  const todayKey = dayKey(new Date());
  const workoutName = new Map(workouts.map((w) => [w.id, w.name]));

  return (
    <div className="week" role="list" aria-label={weekRange(monday)}>
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const key = dayKey(date);
        const done = activity.get(key);
        const planned = plannedOn(date, routines, sessions).map((p) => workoutName.get(p.workoutId)).filter(Boolean);
        const isToday = key === todayKey;
        const isPast = key < todayKey;
        const status = done
          ? `Trained: ${done.sessions.map((s) => s.name).join(', ')}`
          : planned.length
            ? `${isPast ? 'Planned (missed)' : 'Planned'}: ${planned.join(', ')}`
            : 'Rest';
        const label = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${status}`;
        return (
          <button
            key={key}
            role="listitem"
            className={`week-day${isToday ? ' today' : ''}`}
            title={label}
            aria-label={label}
            disabled={!done}
            onClick={() => done && openDay(date, done)}
          >
            <span className="week-name">{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            <span className="week-date tnum">{date.getDate()}</span>
            <span className={`week-mark${done ? ' done' : planned.length ? ' planned' : ''}`} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Home's week: this week's strip, which scrolls sideways back through earlier weeks (arrows beside the title too).
 * The title follows: "This week", "Last week", then the dates. Under it, `current` (this week's summary) or, for an
 * earlier week, what was done in it against the planned days.
 */
export function WeekPager({
  sessions,
  routines,
  workouts,
  current,
}: {
  sessions: Session[];
  routines: Routine[];
  workouts: Workout[];
  current: ReactNode;
}) {
  const [openDay, daySummary] = useOpenDay(sessions);
  const thisMonday = startOfWeek(new Date());
  const activity = dailyActivity(sessions);
  const firstKey = [...activity.keys()].reduce<string | undefined>((a, b) => (a === undefined || b < a ? b : a), undefined);
  const count = firstKey
    ? Math.min(MAX_WEEKS, Math.round((thisMonday.getTime() - startOfWeek(new Date(`${firstKey}T12:00:00`)).getTime()) / (7 * 86_400_000)) + 1)
    : 1;
  const { ref: pagerRef, index: pagerIndex, onScroll: onPagerScroll, go } = usePager(count);
  const back = count - 1 - Math.min(pagerIndex, count - 1);
  const monday = addDays(thisMonday, -7 * back);
  const title = back === 0 ? 'This week' : back === 1 ? 'Last week' : weekRange(monday);

  let past: ReactNode = null;
  if (back > 0) {
    const done = totalsBetween(sessions, monday, addDays(monday, 7));
    const planned = Array.from({ length: 7 }, (_, i) => plannedOn(addDays(monday, i), routines, sessions).length).reduce((a, b) => a + b, 0);
    past = (
      <p className="small tnum week-summary">
        <strong>{planned ? `${done.workouts} of ${planned} planned` : pluralize(done.workouts, 'workout')}</strong> · {pluralize(done.sets, 'set')}
      </p>
    );
  }

  return (
    <>
      {daySummary}
      <div className="week-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {count > 1 && (
          <span className="row" style={{ gap: 2 }}>
            <button className="icon-btn pager-arrow" onClick={() => go(pagerIndex - 1)} disabled={pagerIndex === 0} aria-label="Earlier week">
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn pager-arrow" onClick={() => go(pagerIndex + 1)} disabled={pagerIndex === count - 1} aria-label="Later week">
              <ChevronRight size={18} />
            </button>
          </span>
        )}
      </div>
      <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
        {Array.from({ length: count }, (_, i) => {
          const weekMonday = addDays(thisMonday, -7 * (count - 1 - i));
          return (
            <div key={dayKey(weekMonday)} className="pager-page">
              <WeekStrip monday={weekMonday} sessions={sessions} routines={routines} workouts={workouts} openDay={openDay} activity={activity} />
            </div>
          );
        })}
      </div>
      {back === 0 ? current : past}
    </>
  );
}
