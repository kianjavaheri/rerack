import { Eraser, ExternalLink, Link2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { now } from '../core/ids';
import { isYouTube, linkLabel, normalizeLink } from '../core/links';
import type { Exercise, Workout } from '../core/types';
import { repo } from '../data';
import { useFeedback } from './Feedback';
import { primeKeyboard } from '../utils/keyboard';

function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.35" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M4 19h6" />
      <path d="M7 16v6" />
    </svg>
  );
}

export function NotesButton({ hasNotes, open, onClick, label }: { hasNotes: boolean; open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={`notes-chip notes-btn${hasNotes ? ' has-notes' : ''}${open ? ' open' : ''}`}
      onClick={(e) => {
        if (!open) primeKeyboard(e.currentTarget);
        onClick();
      }}
      aria-expanded={open}
      aria-label={hasNotes ? `${label} (has notes)` : label}
      title={label}
    >
      <NoteIcon />
      Notes
    </button>
  );
}

/**
 * Textarea that grows with its content, so notes never scroll inside a tiny box. With something written, a Clear
 * button empties it in one go and offers Undo (notes are sticky, so deleting a long one by hand was tedious).
 */
function NoteText({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { notify } = useFeedback();
  const clear = () => {
    const before = value;
    onChange('');
    notify('Note cleared', { undo: () => onChange(before) });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (autoFocus && el) el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  return (
    <>
      <textarea
        ref={ref}
        className="notepad-text"
        rows={2}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="notepad-clear" onClick={clear} style={value.trim() ? undefined : { visibility: 'hidden' }} tabIndex={value.trim() ? undefined : -1}>
        <Eraser size={13} /> Clear
      </button>
    </>
  );
}

function YouTubeLogo() {
  return (
    <svg className="link-logo" width={20} height={14} viewBox="0 0 28 20" aria-hidden="true">
      <path fill="#FF0000" d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9Z" />
      <path fill="#fff" d="M11.2 14.3 18.5 10l-7.3-4.3z" />
    </svg>
  );
}

/** Saved links with an "add" field. Only http(s) links are accepted. */
export function LinksEditor({ links, onChange }: { links: string[]; onChange: (links: string[]) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const href = normalizeLink(text);
    if (!href) return setError(true);
    if (!links.includes(href)) onChange([...links, href]);
    setText('');
  };

  return (
    <div className="links">
      {links.map((href) => (
        <div key={href} className="link-row">
          <a href={href} target="_blank" rel="noopener noreferrer" className="link-chip" title={href}>
            {isYouTube(href) ? <YouTubeLogo /> : <ExternalLink size={13} />}
            <span>{linkLabel(href)}</span>
          </a>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => onChange(links.filter((l) => l !== href))} aria-label={`Remove ${linkLabel(href)}`}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="link-add">
        <Link2 size={14} className="muted" />
        <input
          className="link-input"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Add a link (form video, article…)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-invalid={error}
        />
        {text.trim() && (
          <button className="chip" onClick={add}>
            Add
          </button>
        )}
      </div>
      {error && <div className="small" style={{ color: 'var(--danger)' }}>That doesn't look like a web address.</div>}
    </div>
  );
}

/**
 * Note pad for an exercise: notes and links are stored on the exercise, so they show in every workout.
 * Local state is the source of truth while open (the exercise list re-queries on every save).
 */
export function ExerciseNotepad({ exercise }: { exercise: Exercise }) {
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [links, setLinks] = useState(exercise.links ?? []);

  // Always writes both from local state, so a save based on a slightly older `exercise` can't undo the other field.
  const save = (next: { notes: string; links: string[] }) => void repo.saveExercise({ ...exercise, ...next, updatedAt: now() });

  return (
    <div className="notepad">
      <NoteText
        value={notes}
        autoFocus
        placeholder="Cues, seat height, anything to remember"
        onChange={(v) => {
          setNotes(v);
          save({ notes: v, links });
        }}
      />
      <LinksEditor
        links={links}
        onChange={(next) => {
          setLinks(next);
          save({ notes, links: next });
        }}
      />
    </div>
  );
}

/** Note pad for a workout template, shown whenever it's logged. */
export function WorkoutNotepad({ workout, onChange }: { workout: Workout; onChange?: (notes: string) => void }) {
  const [notes, setNotes] = useState(workout.notes ?? '');

  return (
    <div className="notepad">
      <NoteText
        value={notes}
        autoFocus
        placeholder="Warm-up, order, anything to remember"
        onChange={(v) => {
          setNotes(v);
          // Editors that already persist the workout pass onChange; elsewhere save it directly.
          if (onChange) onChange(v);
          else void repo.saveWorkout({ ...workout, notes: v, updatedAt: now() });
        }}
      />
    </div>
  );
}
