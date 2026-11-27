import { ArrowLeft, ArrowLeftRight, ArrowUp, ChartLine, Check, Columns2, Disc3, MoreVertical, Play, Plus, Target, Trash2, X } from 'lucide-react';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';
import { TargetSheet } from '../components/TargetSheet';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { DateTimeFields } from '../components/DateTimeFields';
import { ExercisePicker } from '../components/ExercisePicker';
import { ExerciseRest } from '../components/ExerciseRest';
import { useFeedback } from '../components/Feedback';
import { DEFAULT_SETS, HOME_PATH } from '../config';
import { NotFound } from '../components/NotFound';
import { ExerciseNotepad, NotesButton, WorkoutNotepad } from '../components/Notes';
import { NumericInput } from '../components/NumericInput';
import { ExercisePrevious, PreviousButton } from '../components/PreviousLog';
import { formatRest, RestTimer, restShown } from '../components/RestTimer';
import { SetMenu, SetNumber, type SetKind } from '../components/SetMenu';
import { SupersetButton, SupersetPill, usePills } from '../components/SupersetLink';
import { PageSkeleton } from '../components/Skeleton';
import { formatDate } from '../core/format';
import { now } from '../core/ids';
import { hasNotesOrLinks } from '../core/links';
import { canResume, emptySet, entryFinishedAt, finalizeSession, isEntryDone, isImportedSession, newEntry, orderByProgress, resumeSession, sessionDurationMinutes } from '../core/sessions';
import { exerciseLog, isCompletedSet, lastPerformance, lastPerformanceWithDate, sessionSummary, type PastPerformance } from '../core/stats';
import { groupBounds, leaveSuperset, moveIntoSuperset, moveUnlinked, placeAfter, removeUnlinked, restoreLinks, restsAfter, supersetGroups, supersetWith } from '../core/supersets';
import { DEFAULT_REST_SECONDS, restSecondsFor, type Exercise, type Session, type SessionEntry, type SetLog, type SideLog, type WeightUnit } from '../core/types';
import { barWeight, isBarbellExercise, platesLabel } from '../core/plates';
import { suggestedWeightKg } from '../core/progression';
import { formatWeight, toKg } from '../core/units';
import { repo } from '../data';
import { removeFromAppleHealth, saveToAppleHealth, syncToAppleHealth } from '../native/health';
import { useSettings } from '../hooks/settings';
import { useDragReorder } from '../hooks/useDragReorder';
import { useSlotFlip } from '../hooks/useSlotFlip';
import { ExercisePhotos, ExerciseThumb, hasMedia } from '../components/ExercisePhoto';
import { DoneBurst } from '../components/DoneBurst';
import { haptic, hapticDelete } from '../utils/haptics';
import { playSound } from '../utils/sounds';
import { openWorkoutSummary } from '../components/SummaryWindow';
import { WorkoutSummary } from '../components/WorkoutSummary';
import { workoutSummary } from '../core/summary';
import { WeightInput } from '../components/WeightInput';
import { useExerciseMedia, useIsIsolation } from '../hooks/useCatalog';
import { useEditable } from '../hooks/useEditable';
import { useExercises, useSessions, useWorkouts } from '../hooks/useRepo';
import { useWakeLock } from '../hooks/useWakeLock';
import { canGoBack } from '../utils/history';

type Picking = { mode: 'add' } | { mode: 'swap'; entryId: string } | null;

export function SessionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const isIsolation = useIsIsolation();
  const exercises = useExercises();
  const sessions = useSessions();
  const workouts = useWorkouts();
  const [picking, setPicking] = useState<Picking>(null);
  // While logging, an exercise's Superset pill shows only once its link button is tapped.
  const pills = usePills(false);
  /** The exercise whose Superset pill was tapped: search for one to superset with it. */
  const [supersetFor, setSupersetFor] = useState<string | null>(null);
  /** Slides exercises to their new places when they go into or out of a superset. */
  const flip = useSlotFlip();
  /** Exercises finished this visit: each one plays the completion burst (keyed by the count). */
  const [bursts, setBursts] = useState(0);
  const [burstShown, setBurstShown] = useState(0);
  /**
   * Where an exercise pulled into a superset came from (the id of the one before it, null if first), so taking it out
   * puts it back there. Forgotten once it's moved by hand.
   */
  const origins = useRef(new Map<string, string | null>());
  const rememberOrigin = (entries: SessionEntry[], index: number) => {
    const id = entries[index]?.id;
    if (id && !origins.current.has(id)) origins.current.set(id, entries[index - 1]?.id ?? null);
  };
  /** The "Previous" window open: an exercise's (its id) or the whole workout's. */
  const [previous, setPrevious] = useState<{ exerciseId: string } | null>(null);
  const { notify } = useFeedback();
  const [workoutNotesOpen, setWorkoutNotesOpen] = useState(false);
  const finishing = useRef(false);
  /** Bumped when a finished rest has been up long enough: the bar goes away (`restShown`). */
  const [, setRestGone] = useState(0);

  // Every change stamps lastActivityAt, which is how a workout left open by mistake is spotted.
  const [session, update] = useEditable<Session>(() => repo.getSession(id), (s) => repo.saveSession({ ...s, lastActivityAt: now() }), [id]);
  // Keep the screen on while logging live, so the phone doesn't lock between sets.
  useWakeLock(!!session && !session.finishedAt && session.live !== false && settings.keepAwake !== false);
  // Hold an exercise's name and drag it to change the order, or drop it on a Superset pill to link it there.
  const reorder = useDragReorder(
    session?.entries.length ?? 0,
    (from, to) => {
      const id = session?.entries[from]?.id;
      if (id) origins.current.delete(id);
      update((s) => ({ ...s, entries: moveUnlinked(s.entries, from, to) }));
    },
    (from, host) => {
      if (session) rememberOrigin(session.entries, from);
      flip();
      update((s) => ({ ...s, entries: moveIntoSuperset(s.entries, from, host) }));
    },
  );

  if (session === undefined) return <PageSkeleton />;
  if (session === null) return <NotFound />;

  const exerciseById = new Map(exercises?.map((e) => [e.id, e]));
  const inProgress = !session.finishedAt;
  const live = session.live !== false;
  const summary = sessionSummary(session);
  // Start and Again on the bar reuse the last rest's length (the exercise's own), else the default.
  const barRest = session.restLength || settings.restSeconds || DEFAULT_REST_SECONDS;
  const restAt = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
  // Rest only applies while logging live; it's saved on the session so it survives reopening the app. Each exercise
  // can have its own length (`restSecondsFor`).
  const restOn = settings.restTimer !== false;
  const startRest = (exerciseId: string) => {
    if (!restOn) return;
    const exercise = exerciseById.get(exerciseId);
    const seconds = restSecondsFor(exercise, settings, isIsolation(exercise));
    if (inProgress && live && seconds > 0)
      update((s) => ({ ...s, restEndsAt: restAt(seconds), restLength: seconds, restExerciseId: exerciseId, restPausedLeft: null, restHidden: false }));
  };
  /**
   * An exercise's rest length changed while its rest is under way: the rest takes the new length, keeping the time
   * already rested (3:00 with 1:30 left, changed to 2:00, has 0:30 left). Off (0) ends it.
   */
  const restLengthChanged = (exerciseId: string, to: number) =>
    update((s) => {
      if (s.restExerciseId !== exerciseId || !s.restEndsAt || !s.restLength || Date.parse(s.restEndsAt) <= Date.now()) return s;
      if (to === 0) return { ...s, restEndsAt: null };
      // Worked out from when it started (the end less its length, any ±15 s kept), so typing 2, then 2:3, then 2:30
      // lands on 2:30 however quickly the saves come back.
      const startedAt = Date.parse(s.restEndsAt) - s.restLength * 1000;
      return { ...s, restEndsAt: new Date(startedAt + to * 1000).toISOString(), restLength: to };
    });
  const template = workouts?.find((w) => w.id === session.workoutId);
  // Per side belongs to this logged workout, so other days can't change. The next time the workout is started it
  // follows the newest one (createSessionFromWorkout).
  const togglePerSide = (entry: SessionEntry) =>
    update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entry.id ? { ...e, perSide: !e.perSide } : e)) }));
  /** Changes to a finished workout's name, date or duration also reach its copy in Apple Health. */
  const updateShown = (fn: (s: Session) => Session) =>
    update((s) => {
      const next = fn(s);
      if (next.finishedAt) syncToAppleHealth(next);
      return next;
    });

  const updateEntry = (entryId: string, fn: (e: SessionEntry) => SessionEntry) =>
    update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)) }));

  /** The link button: takes an exercise out of its superset (with Undo), or shows / hides its Superset pill. */
  const toggleSuperset = (entry: SessionEntry) => {
    const index = session.entries.findIndex((e) => e.id === entry.id);
    const [start, end] = groupBounds(session.entries, index);
    if (start === end) return pills.toggle(entry.id);
    const before = session.entries.map((e) => ({ id: e.id, supersetNext: e.supersetNext }));
    // Back to where it was before it was pulled in, if we know (it slides there).
    const origin = origins.current.get(entry.id);
    origins.current.delete(entry.id);
    flip();
    update((s) => {
      const out = leaveSuperset(s.entries, s.entries.findIndex((e) => e.id === entry.id));
      return { ...s, entries: origin === undefined ? out : placeAfter(out, out.findIndex((e) => e.id === entry.id), origin) };
    });
    notify('Superset removed', {
      undo: () => {
        flip();
        update((s) => ({ ...s, entries: restoreLinks(s.entries, before) }));
      },
    });
  };

  /** Supersets the exercise whose pill was tapped with one picked from search (added to this workout if needed). */
  const supersetWithPicked = (hostId: string, exerciseId: string) => {
    const host = session.entries.findIndex((e) => e.id === hostId);
    const occurrence = session.entries.filter((e) => e.exerciseId === exerciseId).length;
    const prevCount = sessions ? lastPerformance(exerciseId, sessions, { excludeSessionId: session.id, before: session.startedAt, occurrence }).length : 0;
    // An exercise already in the workout moves up next to this one: remember where it was.
    const [start, end] = groupBounds(session.entries, host);
    const existing = session.entries.findIndex((e, i) => e.exerciseId === exerciseId && (i < start || i > end));
    if (existing >= 0) rememberOrigin(session.entries, existing);
    flip();
    const entries = supersetWith(session.entries, host, exerciseId, () => newEntry(exerciseId, prevCount || DEFAULT_SETS));
    update((s) => ({ ...s, entries }));
    // The pill moves to under the superset's last exercise, ready for another.
    const [, last] = groupBounds(entries, entries.findIndex((e) => e.id === hostId));
    pills.hide(hostId);
    pills.show(entries[last].id);
  };

  const finish = async () => {
    // A second tap while the first is saving would save it (and add it to Health) twice.
    if (finishing.current) return;
    if (summary.sets === 0) {
      notify('Nothing is logged yet. Fill in a set, or use Cancel workout to discard it.');
      return;
    }
    finishing.current = true;
    const finished = finalizeSession(session);
    try {
      await repo.saveSession(finished);
    } finally {
      finishing.current = false;
    }
    saveToAppleHealth(finished);
    // The summary as a page over everything, with the celebration; closing it leaves the finished workout (in place of
    // the live page, so Back skips that).
    openWorkoutSummary(finished.id, true);
    navigate(`/session/${finished.id}`, { replace: true });
  };

  // Deletes at once and offers Undo instead of asking first.
  const deleteFinished = async () => {
    const deleted = session;
    hapticDelete();
    await repo.deleteSession(deleted.id);
    removeFromAppleHealth(deleted.id);
    navigate('/history', { replace: true });
    notify(`Deleted “${deleted.name}”`, {
      undo: () => {
        void repo.saveSession(deleted);
        saveToAppleHealth(deleted);
      },
    });
  };

  return (
    <div className="narrow">
      {bursts > burstShown && <DoneBurst key={bursts} onDone={() => setBurstShown(bursts)} />}
      <div className="spread" style={{ marginBottom: 14 }}>
        {/* Back to wherever this was opened from (heatmap, Analytics, history…), else a sensible default. */}
        {canGoBack() ? (
          <button className="back-link" style={{ margin: 0 }} onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
        ) : (
          <Link to={inProgress ? HOME_PATH : '/history'} className="back-link" style={{ margin: 0 }}>
            <ArrowLeft size={15} /> {inProgress ? 'Home' : 'History'}
          </Link>
        )}
        {inProgress && (
          // Back to Check in, where it was started from (replacing the page of the deleted workout in history).
          <CancelWorkoutButton
            session={session}
            onCancelled={() => navigate('/check-in', { replace: true })}
            onRestore={(restored) => update(() => restored)}
          />
        )}
        {!inProgress && (
          // A finished workout has no bottom bar (a progress count there read as still under way): its actions are here.
          <div className="row" style={{ gap: 6 }}>
            {sessions && canResume(session, sessions) && (
              <button className="btn btn-sm" onClick={() => update(resumeSession)} title="Pick this workout back up; the timer continues from when it started">
                <Play size={14} /> Resume
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => (canGoBack() ? navigate(-1) : navigate('/history'))}>
              Done
            </button>
          </div>
        )}
      </div>

      {/* Only while resting: checking off a set brings it in under Back (pinned to the top once scrolled to); Stop takes it away. */}
      {inProgress && live && restOn && restShown(session.restEndsAt, session.restPausedLeft) && (
        <RestTimer
          endsAt={session.restEndsAt ?? null}
          pausedLeft={session.restPausedLeft ?? null}
          startLabel={formatRest(barRest)}
          onStart={() => update((s) => ({ ...s, restEndsAt: restAt(barRest), restPausedLeft: null }))}
          onStop={() => update((s) => ({ ...s, restEndsAt: null, restPausedLeft: null }))}
          onPause={() =>
            update((s) =>
              s.restEndsAt ? { ...s, restPausedLeft: Math.max(1, Math.ceil((Date.parse(s.restEndsAt) - Date.now()) / 1000)), restEndsAt: null } : s,
            )
          }
          onResume={() => update((s) => (s.restPausedLeft != null ? { ...s, restEndsAt: restAt(s.restPausedLeft), restPausedLeft: null } : s))}
          onAdjust={(seconds) =>
            update((s) =>
              s.restPausedLeft != null
                ? { ...s, restPausedLeft: Math.max(1, s.restPausedLeft + seconds) }
                : { ...s, restEndsAt: s.restEndsAt ? new Date(Math.max(Date.now(), Date.parse(s.restEndsAt)) + seconds * 1000).toISOString() : null },
            )
          }
          onGone={() => setRestGone((n) => n + 1)}
        />
      )}

      {/* The date and time are in the fields below when they matter; a live workout's time so far is in the bottom bar. */}
      <div className="row" style={{ gap: 6 }}>
        <input
          className="title-input session-name"
          value={session.name}
          onChange={(e) => updateShown((s) => ({ ...s, name: e.target.value }))}
          onBlur={() => !session.name.trim() && updateShown((s) => ({ ...s, name: 'Workout' }))}
          aria-label="Session name"
        />
        {inProgress ? <span className="badge session-state">{live ? '● Live' : 'Logging'}</span> : <span className="chip small session-state">{isImportedSession(session) ? 'From notes' : 'Done'}</span>}
        <span className="session-head-gap" />
        {template && (
          <NotesButton
            label={`Notes for ${template.name}`}
            hasNotes={!!template.notes?.trim()}
            open={workoutNotesOpen}
            onClick={() => setWorkoutNotesOpen(!workoutNotesOpen)}
          />
        )}
      </div>
      {template && workoutNotesOpen && <WorkoutNotepad key={template.id} workout={template} />}
      {!inProgress && sessions && summary.sets > 0 && (
        <WorkoutSummary
          summary={workoutSummary(session, sessions)}
          exerciseById={exerciseById}
          unit={settings.unit}
          onOpen={() => openWorkoutSummary(session.id)}
        />
      )}
      {(!live || !inProgress) && (
        <div style={{ marginTop: 12 }}>
          <DateTimeFields
            value={session.startedAt}
            onChange={(startedAt) => {
              const shift = Date.parse(startedAt) - Date.parse(session.startedAt);
              updateShown((s) => ({
                ...s,
                startedAt,
                finishedAt: s.finishedAt ? new Date(Date.parse(s.finishedAt) + shift).toISOString() : null,
              }));
            }}
          >
            {!inProgress && (
              <label className="duration-field">
                <span className="label">Duration</span>
                <div className="affix">
                  <NumericInput
                    className="input tnum"
                    ariaLabel="Duration in minutes"
                    value={sessionDurationMinutes(session)}
                    placeholder="—"
                    format={(v) => (v == null ? '' : String(v))}
                    parse={(t) => (t ? parseInt(t, 10) : null)}
                    // Empty clears it on purpose (null), so a back-dated live session stops showing its timer.
                    onChange={(minutes) => updateShown((s) => ({ ...s, durationMinutes: minutes }))}
                  />
                  <span className="suffix">min</span>
                </div>
              </label>
            )}
          </DateTimeFields>
        </div>
      )}

      <div className="stack" style={{ marginTop: 22, gap: 12 }}>
        {session.entries.length === 0 && (
          <div className="empty">
            Nothing logged yet.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setPicking({ mode: 'add' })}>
                <Plus size={15} /> Add exercise
              </button>
            </div>
          </div>
        )}
        {supersetGroups(session.entries).map((group) => (
          <div key={group[0].item.id} className={group.length > 1 ? 'superset' : 'stack'} style={group.length > 1 ? undefined : { gap: 12 }}>
            {group.length > 1 && (
              <div className="superset-label">
                Superset · alternate sets, rest after {exerciseById.get(group[group.length - 1].item.exerciseId)?.name ?? 'the last one'}
              </div>
            )}
            {group.map(({ item: entry, index: i }, k) => (
              // The card and the pill under it move together when reordering.
              <div key={entry.id} ref={reorder.itemRef(i)} className="slot" data-slot-id={entry.id}>
                <EntryCard
                  handle={reorder.handle(i)}
                  entry={entry}
                  exercise={exerciseById.get(entry.exerciseId)}
                  last={
                    sessions
                      ? lastPerformanceWithDate(entry.exerciseId, sessions, {
                          excludeSessionId: session.id,
                          before: session.startedAt,
                          occurrence: session.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length,
                        })
                      : null
                  }
                  unit={settings.unit}
                  onChange={(fn) => updateEntry(entry.id, fn)}
                  onRemove={() => {
                    hapticDelete();
                    // The order and links as they were, so Undo puts it back in its place and in its superset.
                    const before = session.entries.map((e) => ({ id: e.id, supersetNext: e.supersetNext }));
                    update((s) => ({ ...s, entries: removeUnlinked(s.entries, s.entries.findIndex((e) => e.id === entry.id)) }));
                    // Only worth an Undo when sets were logged; an untouched exercise is quick to add back.
                    if (entry.sets.some(isCompletedSet)) {
                      notify(`Removed ${exerciseById.get(entry.exerciseId)?.name ?? 'exercise'}`, {
                        undo: () => update((s) => ({ ...s, entries: restoreLinks([...s.entries.filter((e) => e.id !== entry.id), entry], before) })),
                      });
                    }
                  }}
                  onSwap={() => setPicking({ mode: 'swap', entryId: entry.id })}
                  onAddSuperset={() => setSupersetFor(group[group.length - 1].item.id)}
                  onPrevious={() => setPrevious({ exerciseId: entry.exerciseId })}
                  inSuperset={group.length > 1}
                  pillShown={pills.isShown(entry.id)}
                  onSuperset={() => toggleSuperset(entry)}
                  onTogglePerSide={() => togglePerSide(entry)}
                  showRest={inProgress && live && restOn}
                  isolation={isIsolation(exerciseById.get(entry.exerciseId))}
                  onRestChange={(to) => restLengthChanged(entry.exerciseId, to)}
                  onSetDone={(finished, warmup) => {
                    // No rest after a warm-up, or after an exercise's last set (on to the next one) unless Settings asks.
                    if (!warmup && (!finished || settings.restAfterLastSet) && restsAfter(session.entries, i)) startRest(entry.exerciseId);
                    if (!inProgress) return;
                    playSound(finished ? 'exercise' : 'set');
                    if (finished) setBursts((n) => n + 1);
                    // Up past the exercises less far along than it, to the next open spot (orderByProgress).
                    update((s) => {
                      const entries = orderByProgress(s.entries, entry.id);
                      if (entries.every((e, k) => e.id === s.entries[k].id)) return s;
                      flip(entry.id);
                      return { ...s, entries };
                    });
                  }}
                  suggestionKg={
                    inProgress && settings.weightSuggestions !== false && sessions && exerciseById.get(entry.exerciseId)?.kind !== 'bodyweight'
                      ? suggestedWeightKg(
                          entry.targetReps,
                          lastPerformance(entry.exerciseId, sessions, {
                            excludeSessionId: session.id,
                            before: session.startedAt,
                            occurrence: session.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length,
                          }),
                          settings.unit,
                          isBarbellExercise(exerciseById.get(entry.exerciseId)) ? barWeight(exerciseById.get(entry.exerciseId), settings.unit) : undefined,
                        )
                      : null
                  }
                />
                {k === group.length - 1 && pills.isShown(entry.id) && <SupersetPill host={i} onClick={() => setSupersetFor(entry.id)} />}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Before the bar: the bar sticks at the bottom, and as the last thing on the page it never stops above this. */}
      {inProgress && (
        <CancelWorkoutButton
          wide
          session={session}
          onCancelled={() => navigate('/check-in', { replace: true })}
          onRestore={(restored) => update(() => restored)}
        />
      )}

      {inProgress && (
        <div className="sticky-bar">
          {/* How long it's been going (to the second, in the rainbow), then exercises with every set checked. */}
          <div className="small tnum" style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {live && (
              <>
                <strong className="bar-time">
                  <Elapsed since={session.startedAt} />
                </strong>
                <span className="bar-sep" aria-hidden>
                  |
                </span>
              </>
            )}
            <strong>
              {session.entries.filter(isEntryDone).length}/{session.entries.length}
            </strong>
            <span className="muted bar-unit"> exercises</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm bar-add" onClick={() => setPicking({ mode: 'add' })} aria-label="Add exercise" title="Add exercise">
              <Plus size={15} /> <span className="bar-add-text">Exercise</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={finish}>
              <Check size={15} /> {live ? 'Finish' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {!inProgress && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-sm" onClick={() => setPicking({ mode: 'add' })}>
            <Plus size={15} /> Exercise
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteFinished}>
            <Trash2 size={14} /> Delete session
          </button>
        </div>
      )}

      {supersetFor && session.entries.some((e) => e.id === supersetFor) && (() => {
        const host = session.entries.findIndex((e) => e.id === supersetFor);
        const [start, end] = groupBounds(session.entries, host);
        const inGroup = session.entries.slice(start, end + 1).map((e) => e.exerciseId);
        return (
          <ExercisePicker
            title={`Superset ${exerciseById.get(session.entries[host].exerciseId)?.name ?? 'exercise'} with…`}
            featuredIds={session.entries.map((e) => e.exerciseId).filter((id) => !inGroup.includes(id))}
            excludeIds={inGroup}
            onClose={() => setSupersetFor(null)}
            onPick={(ex) => {
              supersetWithPicked(supersetFor, ex.id);
              setSupersetFor(null);
            }}
          />
        );
      })()}

      {previous && sessions && exerciseById.get(previous.exerciseId) && (
        <ExercisePrevious
          exercise={exerciseById.get(previous.exerciseId)!}
          log={exerciseLog(previous.exerciseId, sessions, session.id, session.startedAt)}
          unit={settings.unit}
          onClose={() => setPrevious(null)}
        />
      )}

      {picking && (
        <ExercisePicker
          title={picking.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}
          selectedIds={session.entries.map((e) => e.exerciseId)}
          onClose={() => setPicking(null)}
          onPick={(ex) => {
            if (picking.mode === 'swap') {
              updateEntry(picking.entryId, (e) => ({ ...e, exerciseId: ex.id }));
            } else {
              const occurrence = session.entries.filter((e) => e.exerciseId === ex.id).length;
              const prevCount = sessions ? lastPerformance(ex.id, sessions, { excludeSessionId: session.id, before: session.startedAt, occurrence }).length : 0;
              update((s) => ({ ...s, entries: [...s.entries, newEntry(ex.id, prevCount || DEFAULT_SETS)] }));
            }
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

interface EntryCardProps {
  /** Hold-and-drag reordering (useDragReorder): the part that's held. */
  handle: ReturnType<ReturnType<typeof useDragReorder>['handle']>;
  entry: SessionEntry;
  exercise: Exercise | undefined;
  last: PastPerformance | null;
  unit: WeightUnit;
  onChange: (fn: (e: SessionEntry) => SessionEntry) => void;
  onRemove: () => void;
  onSwap: () => void;
  /** Opens the exercise search to put another exercise in a superset with this one. */
  onAddSuperset: () => void;
  /** Opens this exercise's "Previous" window: every earlier day's sets. */
  onPrevious: () => void;
  /** In a superset with other exercises; the button at the bottom right takes it out, or shows its Superset pill. */
  inSuperset: boolean;
  pillShown: boolean;
  onSuperset: () => void;
  /** A set was checked off; `finished` when it was the exercise's last one left, `warmup` for a warm-up. */
  onSetDone: (finished: boolean, warmup: boolean) => void;
  onTogglePerSide: () => void;
  /** "Go up" weight for this workout (kg), when last time hit the top of the rep range on every set. */
  suggestionKg: number | null;
  /** Live and in progress: shows the exercise's rest length, which can be changed there. */
  showRest: boolean;
  /** An isolation lift: its default rest is Settings' isolation length. */
  isolation: boolean;
  /** Its rest length was changed (to this many seconds). */
  onRestChange: (seconds: number) => void;
}

function EntryCard({ handle, entry, exercise, last, unit, onChange, onRemove, onSwap, onAddSuperset, onPrevious, inSuperset, pillShown, onSuperset, onSetDone, onTogglePerSide, suggestionKg, showRest, isolation, onRestChange }: EntryCardProps) {
  const asPlates = useSettings().settings.perSidePlates === true;
  const [notesOpen, setNotesOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  /** The ⋮ menu (a sheet of actions) and the rep target's sheet. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const navigate = useNavigate();
  const mediaFor = useExerciseMedia();
  const media = exercise ? mediaFor(exercise) : undefined;
  const bodyweight = exercise?.kind === 'bodyweight';
  const previous = last?.sets ?? [];

  const setSet = (setId: string, patch: Partial<SetLog>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));
  const sides = !!entry.sides;
  const setRight = (setId: string, patch: Partial<SideLog>) =>
    onChange((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? { ...s, right: { reps: null, weightKg: null, ...s.right, ...patch } } : s)),
    }));

  const kindOf = (set: SetLog): SetKind => (set.warmup ? 'warmup' : set.drop ? 'drop' : 'working');
  // Which of last time's sets each row lines up with (warm-ups don't count; drop sets do, since they're logged too).
  const working = entry.sets.reduce<number[]>((acc, set) => [...acc, set.warmup ? -1 : acc.filter((n) => n >= 0).length], []);
  // The number shown: straight sets only (1, 2, D, 3).
  const numbers = entry.sets.reduce<number[]>((acc, set) => [...acc, set.warmup || set.drop ? -1 : acc.filter((n) => n >= 0).length], []);
  const label = (i: number) => (entry.sets[i].warmup ? 'Warm-up' : entry.sets[i].drop ? 'Drop set' : String(numbers[i] + 1));
  const barbell = isBarbellExercise(exercise);
  const perSide = barbell && !!entry.perSide;
  const bar = barWeight(exercise, unit);
  // The bar belongs to the exercise, so a 35 lb bar stays for it in every workout.
  const setBar = (weight: number) => exercise && void repo.saveExercise({ ...exercise, barKg: weight === barWeight(undefined, unit) ? undefined : toKg(weight, unit), updatedAt: now() });

  /**
   * Suggested values for set i (its placeholders, and what checking it off empty fills in): what you did in the set
   * above this session, once anything's in it (11 × 10 in set 1 suggests 11 × 10 for set 2); else the same working set
   * last time. A warm-up only follows a warm-up above it, a drop set a drop set, a working set a working one.
   */
  const hint = (i: number): Pick<SetLog, 'weightKg' | 'reps'> | undefined => {
    const above = entry.sets.slice(0, i).findLast((s) => kindOf(s) === kindOf(entry.sets[i]));
    const filled = above && (above.reps != null || above.weightKg != null) ? above : undefined;
    const before = working[i] < 0 ? undefined : (previous[working[i]] ?? previous.at(-1));
    if (!filled && !before) return undefined;
    return {
      weightKg: filled?.weightKg ?? before?.weightKg ?? null,
      reps: filled?.reps ?? before?.reps ?? null,
    };
  };

  const rightHint = (i: number): SideLog => {
    const set = entry.sets[i];
    const above = entry.sets.slice(0, i).findLast((s) => kindOf(s) === kindOf(set));
    const aboveFilled = above && (above.reps != null || above.weightKg != null || above.right?.reps != null || above.right?.weightKg != null);
    const from = aboveFilled ? above.right : working[i] < 0 ? undefined : (previous[working[i]] ?? previous.at(-1))?.right;
    const left = hint(i);
    return {
      reps: from?.reps ?? set.reps ?? left?.reps ?? null,
      weightKg: from?.weightKg ?? set.weightKg ?? left?.weightKg ?? null,
    };
  };

  const toggleDone = (set: SetLog, i: number) => {
    if (set.done) return setSet(set.id, { done: false, doneAt: undefined });
    const h = hint(i);
    const reps = set.reps ?? h?.reps ?? null;
    const weightKg = set.weightKg ?? h?.weightKg ?? null;
    if (!reps) return; // nothing to complete yet
    const r = sides ? rightHint(i) : null;
    const right = r ? { right: { reps: set.right?.reps ?? r.reps ?? reps, weightKg: set.right?.weightKg ?? r.weightKg ?? weightKg } } : {};
    setSet(set.id, { done: true, reps, weightKg, ...right, doneAt: new Date().toISOString() });
    const finishes = entry.sets.every((s) => s.id === set.id || s.done);
    if (!finishes) haptic(undefined, 'light');
    onSetDone(finishes, !!set.warmup);
  };
  const finishedAt = entryFinishedAt(entry);

  // "Go up" stays until the suggested weight is filled into every working set still to do, or a working set is logged.
  const toDo = entry.sets.filter((s) => !s.done && !s.warmup && !s.drop);
  const started = entry.sets.some((s) => s.done && !s.warmup);
  const showSuggestion = suggestionKg != null && !started && toDo.some((s) => s.weightKg !== suggestionKg);
  const applySuggestion = () =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (!s.done && !s.warmup && !s.drop ? { ...s, weightKg: suggestionKg } : s)) }));

  const addSet = () =>
    onChange((e) => {
      const last = e.sets.at(-1);
      return { ...e, sets: [...e.sets, { ...emptySet(), weightKg: last?.weightKg ?? null }] };
    });

  const lastText = last ? (last.undated ? 'Last: no date' : `Last ${shortAgo(last.date)}`) : 'First time';
  const menuActions: SheetAction[] = [
    { label: 'Replace exercise', icon: <ArrowLeftRight size={20} />, onSelect: onSwap },
    { label: 'Add to superset', icon: <Plus size={20} />, onSelect: onAddSuperset },
    {
      label: sides ? 'Log both sides together' : 'Left and right separately',
      icon: <Columns2 size={20} />,
      onSelect: () =>
        onChange((e) =>
          e.sides
            ? { ...e, sides: undefined, sets: e.sets.map(({ right: _right, ...s }) => s) }
            : { ...e, sides: true },
        ),
    },
    { label: 'Progress', icon: <ChartLine size={20} />, onSelect: () => navigate(`/analytics?exercise=${entry.exerciseId}`) },
    { label: 'Remove exercise', icon: <X size={20} />, danger: true, onSelect: onRemove },
  ];

  return (
    // Hold anywhere on the card (but a button or field) and drag to move it.
    <div className="card holdable" style={{ padding: '14px 16px' }} {...handle}>
      <div className="entry-top">
        {/* Left: its photo (tap for how it's done). */}
        <div className="entry-side">
          {exercise && media && hasMedia(media) && (
            <button className="thumb-btn" onClick={() => setPhotosOpen(true)} aria-label={`Photos of ${exercise.name}`} title="How it's done">
              <ExerciseThumb media={media} size={44} />
            </button>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-title" style={{ fontSize: 16, paddingTop: 4 }}>
            {exercise?.name ?? 'Unknown exercise'}
          </div>
          <div className="muted small entry-meta">
            {[
              // When it was finished (sets checked off before times were kept have none), then last time.
              finishedAt ? `Done ${new Date(finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : null,
              lastText,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {showSuggestion && (
            <button className="chip go-up" onClick={applySuggestion} title="Last time every set hit the top of the range. Tap to use this weight.">
              <ArrowUp size={13} /> Go up to {formatWeight(suggestionKg, unit)} {unit}
            </button>
          )}
          {entry.notes && (
            <div className="small" style={{ marginTop: 4 }}>
              {entry.notes}
            </div>
          )}
        </div>
        {/* Right, in two columns: its rest over Notes (the same width, lined up), ⋮ over Last (every earlier time). */}
        <div className="entry-actions">
          {exercise && showRest && <ExerciseRest exercise={exercise} isolation={isolation} onChange={onRestChange} />}
          <button className="icon-btn entry-menu" onClick={() => setMenuOpen(true)} aria-label={`Options for ${exercise?.name ?? 'this exercise'}`} title="Options">
            <MoreVertical size={18} />
          </button>
          {exercise && (
            <>
              <NotesButton
                label={`Notes and links for ${exercise.name}`}
                hasNotes={hasNotesOrLinks(exercise)}
                open={notesOpen}
                onClick={() => setNotesOpen(!notesOpen)}
              />
              <PreviousButton label={`Last times: ${exercise.name}`} onClick={onPrevious} />
            </>
          )}
        </div>
      </div>
      {menuOpen && <ActionSheet title={exercise?.name ?? 'Exercise'} actions={menuActions} onClose={() => setMenuOpen(false)} />}
      {targetOpen && <TargetSheet entry={entry} onChange={(targetReps) => onChange((e) => ({ ...e, targetReps }))} onClose={() => setTargetOpen(false)} />}

      {exercise && notesOpen && <ExerciseNotepad key={exercise.id} exercise={exercise} />}
      {photosOpen && exercise && media && <ExercisePhotos name={exercise.name} media={media} onClose={() => setPhotosOpen(false)} />}

      <div className="set-grid" style={{ marginTop: 12 }}>
        <span className="head head-set">Set</span>
        <span className="head reps-head">
          Reps
          {/* The rep target: "Aim for 6-12 reps per set", and change it for this workout. */}
          <button className="target-btn" onClick={() => setTargetOpen(true)} aria-label="Rep target" title="Rep target">
            <Target size={14} strokeWidth={2.3} />
          </button>
        </span>
        <span className="head weight-head">
          {barbell ? (
            // Type one side of the bar instead of the total, in this workout. Only how it's shown changes: the same
            // total reads 115 or 35, and that's all that's saved. The whole header is the switch.
            <button
              className={`head-btn${perSide ? ' on' : ''}`}
              onClick={onTogglePerSide}
              aria-pressed={perSide}
              title="Enter the weight on one side of the bar; the total works itself out"
            >
              <Disc3 size={12} /> {perSide ? 'Per side' : 'Weight'}
            </button>
          ) : bodyweight ? (
            '+ Weight'
          ) : (
            'Weight'
          )}
        </span>
        <span className="head head-done">Done</span>
        <span aria-hidden />
        {entry.sets.map((set, i) => {
          const h = hint(i);
          const shownWeight = set.weightKg ?? h?.weightKg ?? null;
          const rh = sides ? rightHint(i) : null;
          const side = (which: 'L' | 'R', field: ReactNode) =>
            sides ? (
              <span className="side-field" data-side={which}>
                {field}
              </span>
            ) : (
              field
            );
          return (
            <div key={set.id} className={`set-row${set.done ? ' done' : ''}${sides ? ' sided' : ''}`} style={{ display: 'contents' }}>
              <SetNumber label={label(i)} kind={kindOf(set)} />
              {side(
                'L',
                <NumericInput
                  className="set-input"
                  ariaLabel={`Set ${label(i)}${sides ? ' left' : ''} reps`}
                  value={set.reps}
                  placeholder={h?.reps != null ? String(h.reps) : entry.targetReps?.split(/\D/)[0] || '0'}
                  format={(v) => (v == null ? '' : String(v))}
                  parse={(t) => (t ? parseInt(t, 10) : null)}
                  onChange={(reps) => setSet(set.id, { reps, done: reps ? set.done : false })}
                />,
              )}
              {side(
                'L',
                <WeightInput
                  className="set-input"
                  ariaLabel={`Set ${label(i)}${sides ? ' left' : ''} weight`}
                  value={set.weightKg}
                  hintKg={h?.weightKg}
                  emptyPlaceholder={bodyweight ? 'BW' : '0'}
                  unit={unit}
                  perSide={perSide}
                  bar={bar}
                  asPlates={asPlates}
                  onChange={(weightKg) => setSet(set.id, { weightKg })}
                />,
              )}
              <button
                className={`check${set.done ? ' on' : ''}`}
                onClick={() => toggleDone(set, i)}
                aria-label={set.done ? `Mark set ${label(i)} not done` : `Complete set ${label(i)}`}
                aria-pressed={set.done}
              >
                <Check size={17} />
              </button>
              <SetMenu
                label={label(i)}
                kind={kindOf(set)}
                plates={barbell && shownWeight != null ? platesLabel(Number(formatWeight(shownWeight, unit)), unit, bar) : null}
                weightText={shownWeight != null ? `${formatWeight(shownWeight, unit)} ${unit}` : ''}
                bar={barbell ? { weight: bar, unit, onChange: setBar } : undefined}
                onKind={(kind) => setSet(set.id, { warmup: kind === 'warmup' || undefined, drop: kind === 'drop' || undefined })}
                onDelete={() => onChange((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== set.id) }))}
              />
              {rh && (
                <>
                  <span className="side-gap" aria-hidden />
                  {side(
                    'R',
                    <NumericInput
                      className="set-input"
                      ariaLabel={`Set ${label(i)} right reps`}
                      value={set.right?.reps ?? null}
                      placeholder={rh.reps != null ? String(rh.reps) : entry.targetReps?.split(/\D/)[0] || '0'}
                      format={(v) => (v == null ? '' : String(v))}
                      parse={(t) => (t ? parseInt(t, 10) : null)}
                      onChange={(reps) => setRight(set.id, { reps })}
                    />,
                  )}
                  {side(
                    'R',
                    <WeightInput
                      className="set-input"
                      ariaLabel={`Set ${label(i)} right weight`}
                      value={set.right?.weightKg ?? null}
                      hintKg={rh.weightKg}
                      emptyPlaceholder={bodyweight ? 'BW' : '0'}
                      unit={unit}
                      perSide={perSide}
                      bar={bar}
                      asPlates={asPlates}
                      onChange={(weightKg) => setRight(set.id, { weightKg })}
                    />,
                  )}
                  <span className="side-gap" aria-hidden />
                  <span className="side-gap" aria-hidden />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="add-set-row">
        <button className="btn btn-sm add-set-btn" onClick={addSet}>
          <Plus size={14} /> Add set
        </button>
        <span style={{ marginRight: -6 }}>
          <SupersetButton inSuperset={inSuperset} pillShown={pillShown} onClick={onSuperset} />
        </span>
      </div>
    </div>
  );
}

/** Time so far, to the second: "8m 32s", "1h 5m 3s" (short, so "0/6 exercises" still fits beside it on a phone). */
function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return <>{h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`}</>;
}

/** Last time, short enough for one line under the name: "today", "3d ago", else "Oct 21". */
function shortAgo(iso: string) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff < 7) return `${diff}d ago`;
  return formatDate(iso);
}
