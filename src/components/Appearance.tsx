import { Check, Lock } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ACCENT_PRESETS, accentOf, accentTone, isCustomAccent } from '../core/accents';
import { isPlusAccent, isPlusTheme } from '../core/plus';
import type { ThemePreference } from '../core/types';
import { applyAccent, useSettings } from '../hooks/settings';
import { openPlusSheet } from './PlusSheet';

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'bamboo', label: 'Bamboo' },
];

/**
 * System, Light, Dark or Bamboo (a light theme on a warm off-white page; Plus). Without Plus, Bamboo is tried on
 * (`preview`, see PlusPreviewBar) rather than saved.
 */
export function ThemePicker() {
  const { settings, update, plus, preview, setPreview } = useSettings();
  const theme = preview?.theme ?? settings.theme;
  return (
    <div className="segmented theme-picker">
      {THEMES.map((t) => {
        const locked = !plus && isPlusTheme(t.id);
        return (
          <button
            key={t.id}
            className={theme === t.id ? 'on' : ''}
            onClick={() => {
              if (locked) return setPreview({ ...preview, theme: t.id });
              if (preview?.theme) setPreview(preview.accent ? { accent: preview.accent } : null);
              update({ theme: t.id });
            }}
          >
            {t.label}
            {locked && <Lock size={11} strokeWidth={2.5} className="plus-lock-inline" aria-label="Plus" />}
          </button>
        );
      })}
    </div>
  );
}

const sweepOf = (accent: string, dark: boolean) => {
  const { rb } = accentTone(accent, dark);
  return `linear-gradient(135deg, ${rb[0]}, ${rb[2]} 50%, ${rb[5]})`;
};

/**
 * The accent: a row of premade ones (each drawn in its sweep for the theme in use) and Custom, which opens a colour
 * wheel. Changes apply at once; the wheel shows its colour on the whole app while it's turned and saves on letting go.
 */
export function AccentPicker() {
  const { settings, update, resolvedTheme, plus, preview, setPreview } = useSettings();
  const dark = resolvedTheme === 'dark';
  const accent = preview?.accent ?? accentOf(settings);
  const custom = isCustomAccent(accent);
  const [wheelOpen, setWheelOpen] = useState(custom);
  // Without Plus a Plus accent is tried on, not saved; picking a free one ends the try.
  const choose = (next: string) => {
    if (!plus && isPlusAccent(next)) return setPreview({ ...preview, accent: next });
    if (preview?.accent) setPreview(preview.theme ? { theme: preview.theme } : null);
    update({ accent: next });
  };

  return (
    <div className="accent-picker">
      <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={accent === p.id}
            className={`accent-swatch${accent === p.id ? ' on' : ''}`}
            onClick={() => {
              setWheelOpen(false);
              choose(p.id);
            }}
          >
            <span className="accent-dot" style={{ background: sweepOf(p.id, dark) }}>
              {accent === p.id && <Check size={16} strokeWidth={3} style={{ color: accentTone(p.id, dark).on }} />}
              {!plus && isPlusAccent(p.id) && (
                <span className="plus-lock" aria-label="Plus">
                  <Lock size={9} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="accent-name">{p.name}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className={`accent-swatch${custom ? ' on' : ''}`}
          onClick={() => setWheelOpen(!wheelOpen || !custom)}
        >
          <span className="accent-dot accent-dot-wheel">
            {custom && <span className="accent-dot-inner" style={{ background: accent }} />}
            {!plus && (
              <span className="plus-lock" aria-label="Plus">
                <Lock size={9} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="accent-name">Custom</span>
        </button>
      </div>
      {wheelOpen && (
        <ColorWheel
          value={custom ? accent : null}
          onPreview={(hex) => applyAccent(hex, dark)}
          onChange={choose}
        />
      )}
      <PlusPreviewBar />
    </div>
  );
}

/**
 * Shown while a Plus look is being tried on without Plus: what it is, Get Plus, and Undo. Nothing is saved meanwhile,
 * and leaving (Settings, the intro step) ends the try. Getting Plus while trying keeps what was tried.
 */
function PlusPreviewBar() {
  const { plus, preview, setPreview, update } = useSettings();
  const previewRef = useRef(preview);
  previewRef.current = preview;

  useEffect(() => () => setPreview(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plus || !previewRef.current) return;
    update(previewRef.current);
    setPreview(null);
  }, [plus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!preview || plus) return null;
  const what = [
    preview.accent && (isCustomAccent(preview.accent) ? 'your own colour' : ACCENT_PRESETS.find((p) => p.id === preview.accent)?.name),
    preview.theme === 'bamboo' && 'Bamboo',
  ]
    .filter(Boolean)
    .join(' and ');
  return (
    <div className="plus-preview" role="status">
      <div className="plus-preview-text">
        <strong>Trying {what}</strong>
        <span className="muted small">Keep it with Rerack Plus.</span>
      </div>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview(null)}>
        Undo
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={openPlusSheet}>
        Get Plus
      </button>
    </div>
  );
}

// ---- Colour wheel: hue round the circle, saturation out from the middle, brightness on a slider under it ----

type Hsv = { h: number; s: number; v: number };

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function ColorWheel({ value, onPreview, onChange }: { value: string | null; onPreview: (hex: string) => void; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => (value ? hexToHsv(value) : { h: 200, s: 0.75, v: 0.9 }));
  const discRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hex = hsvToHex(hsv);

  const pick = (e: ReactPointerEvent) => {
    const r = discRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    const next = { ...hsv, h, s };
    setHsv(next);
    onPreview(hsvToHex(next));
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onChange(hex);
  };

  const angle = (hsv.h * Math.PI) / 180;
  const thumb = { left: `${50 + Math.sin(angle) * hsv.s * 50}%`, top: `${50 - Math.cos(angle) * hsv.s * 50}%` };

  return (
    <div className="color-wheel" data-no-swipe>
      <div
        className="color-disc"
        ref={discRef}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => dragging.current && pick(e)}
        onPointerUp={end}
        onPointerCancel={end}
        role="slider"
        aria-label="Colour"
        aria-valuetext={hex}
      >
        <span className="color-disc-dim" style={{ opacity: 1 - hsv.v }} />
        <span className="color-thumb" style={{ ...thumb, background: hex }} />
      </div>
      <div className="color-controls">
        <span className="color-preview" style={{ background: hex }} />
        <input
          type="range"
          className="color-brightness"
          min={25}
          max={100}
          value={Math.round(hsv.v * 100)}
          aria-label="Brightness"
          style={{ background: `linear-gradient(90deg, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
          onChange={(e) => {
            const next = { ...hsv, v: Number(e.target.value) / 100 };
            setHsv(next);
            onPreview(hsvToHex(next));
          }}
          onPointerUp={() => onChange(hex)}
          onKeyUp={() => onChange(hex)}
          onTouchEnd={() => onChange(hex)}
        />
        <span className="color-hex">{hex.toUpperCase()}</span>
      </div>
    </div>
  );
}
