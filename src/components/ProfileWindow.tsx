import { Camera, User, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { dayString, feetInches, fromFeetInches, weightChange, withoutWeight, withWeight } from '../core/body';
import { formatDate, formatDateLong } from '../core/format';
import type { Profile } from '../core/types';
import { formatWeight, parseWeightInput } from '../core/units';
import { useSettings } from '../hooks/settings';
import { squarePhoto } from '../utils/image';
import { ACCENT } from './chartTheme';
import { Modal } from './Modal';
import { NumericInput } from './NumericInput';

/**
 * Settings → Profile: the name and photo the app shows (over the sign-in's), height, and body weight over time. All
 * optional and only here, so it never gets in the way.
 */
export function ProfileWindow({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { settings, update, resolvedTheme } = useSettings();
  const unit = settings.unit;
  const profile = settings.profile ?? {};
  const weights = settings.bodyWeights ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [weightText, setWeightText] = useState('');

  const setProfile = (patch: Partial<Profile>) => update({ profile: { ...profile, ...patch } });
  const photo = profile.photo || user?.photoURL;
  const name = profile.name ?? '';
  const initial = (name.trim() || user?.name || user?.email || '')[0]?.toUpperCase();

  const pickPhoto = async (file: File) => {
    setPhotoError(null);
    try {
      setProfile({ photo: await squarePhoto(file) });
    } catch {
      setPhotoError('That file couldn’t be read as a photo.');
    }
  };

  const today = dayString(new Date());
  const logWeight = () => {
    const kg = parseWeightInput(weightText, unit);
    if (kg == null || kg <= 0) return;
    update({ bodyWeights: withWeight(weights, today, kg) });
    setWeightText('');
  };
  const latest = weights.at(-1);
  const change = weightChange(weights, 30);
  const data = weights.map((w) => ({ t: Date.parse(`${w.date}T12:00:00`), v: Number(formatWeight(w.kg, unit)) }));
  const ft = profile.heightCm ? feetInches(profile.heightCm) : null;

  return (
    <Modal title="Profile" onClose={onClose}>
      <div className="profile-top">
        <button className="profile-photo" onClick={() => fileRef.current?.click()} aria-label="Change photo">
          {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{initial ?? <User size={40} />}</span>}
          <span className="profile-photo-badge" aria-hidden>
            <Camera size={14} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
            e.target.value = '';
          }}
        />
        {profile.photo && (
          <button className="link-btn small" onClick={() => setProfile({ photo: undefined })}>
            {user?.photoURL ? 'Use my account’s photo' : 'Remove photo'}
          </button>
        )}
        {photoError && <span className="small" style={{ color: 'var(--danger)' }}>{photoError}</span>}
      </div>

      <label className="profile-field">
        <span className="label">Name</span>
        <input className="input" value={name} placeholder={user?.name ?? 'Your name'} autoComplete="name" onChange={(e) => setProfile({ name: e.target.value || undefined })} />
      </label>

      <div className="profile-field">
        <span className="label">Height</span>
        {unit === 'kg' ? (
          <div className="affix" style={{ maxWidth: 140 }}>
            <NumericInput
              ariaLabel="Height in centimetres"
              value={profile.heightCm ? Math.round(profile.heightCm) : null}
              placeholder="cm"
              format={(v) => (v == null ? '' : String(v))}
              parse={(t) => (t ? parseInt(t, 10) : null)}
              onChange={(cm) => setProfile({ heightCm: cm && cm > 0 ? cm : undefined })}
            />
            <span className="suffix">cm</span>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <div className="affix" style={{ maxWidth: 96 }}>
              <NumericInput
                ariaLabel="Height, feet"
                value={ft?.ft ?? null}
                placeholder="5"
                format={(v) => (v == null ? '' : String(v))}
                parse={(t) => (t ? parseInt(t, 10) : null)}
                onChange={(f) => setProfile({ heightCm: f ? fromFeetInches(f, ft?.in ?? 0) : undefined })}
              />
              <span className="suffix">ft</span>
            </div>
            <div className="affix" style={{ maxWidth: 96 }}>
              <NumericInput
                ariaLabel="Height, inches"
                value={ft ? ft.in : null}
                placeholder="10"
                format={(v) => (v == null ? '' : String(v))}
                parse={(t) => (t ? parseInt(t, 10) : null)}
                onChange={(i) => setProfile({ heightCm: fromFeetInches(ft?.ft ?? 0, Math.min(11, i ?? 0)) || undefined })}
              />
              <span className="suffix">in</span>
            </div>
          </div>
        )}
      </div>

      <section className="profile-weight">
        <div className="spread">
          <h3 className="profile-subhead">Body weight</h3>
          {latest && (
            <span className="muted small tnum">
              {formatWeight(latest.kg, unit)} {unit}
              {change != null && Math.abs(change) >= 0.05 && ` · ${change > 0 ? '+' : '−'}${formatWeight(Math.abs(change), unit)} in 30 days`}
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <div className="affix" style={{ flex: 1 }}>
            <input
              className="input"
              inputMode="decimal"
              enterKeyHint="done"
              aria-label={`Today's weight in ${unit}`}
              placeholder={weights.some((w) => w.date === today) ? 'Change today’s' : 'Today’s weight'}
              value={weightText}
              onChange={(e) => setWeightText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logWeight()}
            />
            <span className="suffix">{unit}</span>
          </div>
          <button className="btn btn-primary" onClick={logWeight} disabled={!(parseWeightInput(weightText, unit)! > 0)}>
            Log
          </button>
        </div>
        {data.length >= 2 && (
          <div className="profile-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => formatDate(new Date(t).toISOString())}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: 'var(--faint)', strokeWidth: 1 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="chart-tooltip small tnum">
                        <div className="muted">{formatDateLong(new Date(Number(label)).toISOString())}</div>
                        <strong>
                          {String(payload[0].value)} {unit}
                        </strong>
                      </div>
                    ) : null
                  }
                />
                <Line type="monotone" dataKey="v" stroke={ACCENT[resolvedTheme]} strokeWidth={2} dot={data.length <= 30 ? { r: 3, fill: ACCENT[resolvedTheme], strokeWidth: 0 } : false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {weights.length > 0 && (
          <ul className="profile-weights">
            {[...weights]
              .reverse()
              .slice(0, 8)
              .map((w) => (
                <li key={w.date}>
                  <span>{w.date === today ? 'Today' : formatDate(`${w.date}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="tnum">
                    {formatWeight(w.kg, unit)} {unit}
                  </span>
                  <button className="icon-btn" aria-label={`Remove ${w.date}`} onClick={() => update({ bodyWeights: withoutWeight(weights, w.date) })}>
                    <X size={14} />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
