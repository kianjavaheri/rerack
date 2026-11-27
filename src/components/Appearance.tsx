import { Check } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ACCENT_PRESETS, accentOf, accentTone, isCustomAccent } from '../core/accents';
import type { ThemePreference } from '../core/types';
import { applyAccent, useSettings } from '../hooks/settings';

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'bamboo', label: 'Bamboo' },
];

/** System, Light, Dark or Bamboo (a light theme on a warm off-white page). */
export function ThemePicker() {
  const { settings, update } = useSettings();
  return (
    <div className="segmented theme-picker">
      {THEMES.map((t) => (
        <button key={t.id} className={settings.theme === t.id ? 'on' : ''} onClick={() => update({ theme: t.id })}>
          {t.label}
        </button>
      ))}
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
  const { settings, update, resolvedTheme } = useSettings();
  const dark = resolvedTheme === 'dark';
  const accent = accentOf(settings);
  const custom = isCustomAccent(accent);
  const [wheelOpen, setWheelOpen] = useState(custom);

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
              update({ accent: p.id });
            }}
          >
            <span className="accent-dot" style={{ background: sweepOf(p.id, dark) }}>
              {accent === p.id && <Check size={16} strokeWidth={3} style={{ color: accentTone(p.id, dark).on }} />}
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
          </span>
          <span className="accent-name">Custom</span>
        </button>
      </div>
      {wheelOpen && (
        <ColorWheel
          value={custom ? accent : null}
          onPreview={(hex) => applyAccent(hex, dark)}
          onChange={(hex) => update({ accent: hex })}
        />
      )}
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
