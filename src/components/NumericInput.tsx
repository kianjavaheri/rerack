import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Turns the stored value into display text. */
  format: (value: number | null) => string;
  /** Optional text shown while not being edited (Per side as plates: "45 + 25"); editing goes back to `format`'s. */
  display?: (value: number | null) => string;
  /** Turns typed text into a stored value (null when empty / invalid). */
  parse: (text: string) => number | null;
  placeholder?: string;
  decimal?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * Number field that keeps the raw text while typing (so "62." isn't reformatted
 * mid-entry) and resyncs from the stored value when not focused.
 */
export function NumericInput({ value, onChange, format, display, parse, placeholder, decimal, ariaLabel, className = '' }: Props) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);
  /** Focused by this press: its mouseup would collapse the selection that focusing made. */
  const justFocused = useRef(false);
  /** Being edited: shows the typed text rather than `display`'s. */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={`input ${className}${display && !editing ? ' as-display' : ''}`}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={display && !editing ? display(value) : text}
      onFocus={(e) => {
        focused.current = true;
        justFocused.current = true;
        if (display) {
          // The plain number comes in on the next render; select it once it's there.
          setEditing(true);
          const field = e.target;
          requestAnimationFrame(() => field.select());
        } else e.target.select();
      }}
      // Clicking into the field keeps the whole value selected, so typing replaces it rather than adding digits.
      onMouseUp={(e) => {
        if (justFocused.current) e.preventDefault();
        justFocused.current = false;
      }}
      onBlur={() => {
        focused.current = false;
        justFocused.current = false;
        setEditing(false);
        setText(format(value));
      }}
      onChange={(e) => {
        const raw = decimal ? e.target.value.replace(',', '.') : e.target.value;
        if (!/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        onChange(parse(raw));
      }}
    />
  );
}
