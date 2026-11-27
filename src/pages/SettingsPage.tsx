import { ArrowLeft, Download, LogOut, Upload } from 'lucide-react';
import { MEDIA } from '../data/catalog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SignInButtons } from '../auth/SignInButtons';
import { AccentPicker, ThemePicker } from '../components/Appearance';
import { useFeedback } from '../components/Feedback';
import { NotificationChoice } from '../components/NotificationChoice';
import { ProfileFields, ProfileHeader } from '../components/Profile';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { RestLength } from '../components/RestLength';
import { checkSnapshot } from '../core/backup';
import { isImportedSession } from '../core/sessions';
import { sessionSummary } from '../core/stats';
import { anyNotificationOn } from '../core/notifications';
import { pluralize } from '../core/format';
import { DEFAULT_REST_SECONDS, DEFAULT_WEIGHT_STEP, defaultRestSeconds, weightStepFor, type NotificationSettings, type WeightUnit } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useSessions } from '../hooks/useRepo';
import { appleHealthOn, healthSupported, healthWorkouts, saveAllToAppleHealth, setAppleHealth } from '../native/health';
import { canGoBack } from '../utils/history';
import { askNotificationPermission, notificationsAllowed } from '../native/notifications';
import { isNative, SITE_URL } from '../native/platform';
import { APP_NAME, HOME_PATH } from '../config';

/** iPhone app only: save finished workouts to Apple Health (per phone, since Health permission is). */
function AppleHealthCard() {
  const sessions = useSessions();
  const { notify } = useFeedback();
  const [on, setOn] = useState(appleHealthOn);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    const next = await setAppleHealth(!on);
    setOn(next);
    setNote(!on && !next ? 'Health didn’t allow it. Turn on Rerack in the Health app → Sharing → Apps, then try again.' : null);
  };
  // Only workouts finished while it's on are saved, so earlier ones can be added in one go.
  const past = sessions ? healthWorkouts(sessions).length : 0;
  const savePast = async () => {
    if (!sessions) return;
    setSaving(true);
    await saveAllToAppleHealth(sessions);
    setSaving(false);
    setNote(null);
    notify(`Saved ${pluralize(past, 'workout')} to Apple Health`);
  };
  return (
    <div className="card">
      <div className="spread" style={{ flexWrap: 'nowrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Apple Health</div>
          <div className="muted small">
            Save each workout you finish as strength training. They’re in the Fitness app, and in Health under Browse → Activity → Workouts.
          </div>
        </div>
        <button type="button" className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label="Save workouts to Apple Health" onClick={() => void toggle()} />
      </div>
      {on && past > 0 && (
        <button className="btn btn-sm" style={{ marginTop: 10 }} disabled={saving} onClick={() => void savePast()}>
          {saving ? 'Saving…' : `Save past workouts (${past})`}
        </button>
      )}
      {note && (
        <div className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {note}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const { confirm, notify } = useFeedback();
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  // Workouts you've logged (not notes imported into the Log), for the header's count.
  const sessions = useSessions();
  const workoutCount = (sessions ?? []).filter((s) => s.finishedAt && !isImportedSession(s) && sessionSummary(s).sets > 0).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const exportData = async () => {
    const snapshot = await repo.exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-tracker-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup downloaded.');
  };

  const importData = async (file: File) => {
    try {
      const snapshot: unknown = JSON.parse(await file.text());
      // Checked before asking, so a wrong file says so instead of "Restore this backup?".
      checkSnapshot(snapshot);
      const ok = await confirm({
        title: 'Restore this backup?',
        message: `Everything ${signedIn ? 'in your account' : 'on this device'} is replaced with the backup. This can't be undone.`,
        confirmLabel: 'Replace my data',
        danger: true,
      });
      if (!ok) return;
      await repo.importSnapshot(snapshot);
      setStatus('Backup restored.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <>
      {/* In the app Settings is opened from the account button, not a tab, so it has a way back. */}
      <button className="back-link app-only" onClick={() => (canGoBack() ? navigate(-1) : navigate(HOME_PATH, { replace: true }))}>
        <ArrowLeft size={15} /> Back
      </button>
      {/* Two parts, each with its own heading: you (Profile), then how the app works (Settings). */}
      <h1 className="title">Profile</h1>

      <div className="stack" style={{ marginTop: 20, maxWidth: 680 }}>
        <ProfileHeader workouts={workoutCount} />
        <ProfileFields />
        {auth.status === 'local' && <SignInCard />}

        <h2 className="title settings-heading">Settings</h2>

        <div className="card">
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Weight unit</div>
              <div className="muted small">Switching converts everything; nothing is lost.</div>
            </div>
            <div className="segmented">
              {(['lb', 'kg'] as WeightUnit[]).map((u) => (
                <button key={u} className={settings.unit === u ? 'on' : ''} onClick={() => update({ unit: u })}>
                  {u === 'lb' ? 'Pounds' : 'Kilograms'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Rest timer</div>
              <div className="muted small">
                {settings.restTimer === false
                  ? 'Off: no rest bar or rest times during workouts.'
                  : 'Starts when you check off a set during a live workout. Exercises can have their own length.'}
              </div>
            </div>
            <button
              type="button"
              className={`switch${settings.restTimer !== false ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.restTimer !== false}
              aria-label="Rest timer"
              onClick={() => update({ restTimer: settings.restTimer === false })}
            />
          </div>
          {settings.restTimer !== false && (
            <>
              {/* Defaults only: an exercise given its own rest keeps it. */}
              {/* Each length under its label, the same for both. */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Compound lifts</div>
                <div className="muted small">Squats, presses, rows</div>
                <div style={{ marginTop: 8 }}>
                  <RestLength seconds={settings.restSeconds ?? DEFAULT_REST_SECONDS} onChange={(restSeconds) => update({ restSeconds })} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Isolation lifts</div>
                <div className="muted small">Curls, raises, extensions</div>
                <div style={{ marginTop: 8 }}>
                  <RestLength seconds={defaultRestSeconds(settings, true)} onChange={(restIsolationSeconds) => update({ restIsolationSeconds })} />
                </div>
              </div>
              <p className="muted small" style={{ margin: '12px 0 0' }}>
                Up to 60 minutes; 0:00 starts it only when you tap Start. Exercises you've given their own rest keep it.
              </p>
              <div className="spread" style={{ marginTop: 14, flexWrap: 'nowrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Rest after an exercise's last set</div>
                  <div className="muted small">Off: finishing an exercise goes straight on to the next.</div>
                </div>
                <button
                  type="button"
                  className={`switch${settings.restAfterLastSet ? ' on' : ''}`}
                  role="switch"
                  aria-checked={!!settings.restAfterLastSet}
                  aria-label="Rest after an exercise's last set"
                  onClick={() => update({ restAfterLastSet: !settings.restAfterLastSet })}
                />
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Weight suggestions</div>
              <div className="muted small">Suggests a heavier weight when you hit the top of the rep range on every set last time.</div>
            </div>
            <button
              type="button"
              className={`switch${settings.weightSuggestions !== false ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.weightSuggestions !== false}
              aria-label="Weight suggestions"
              onClick={() => update({ weightSuggestions: settings.weightSuggestions === false })}
            />
          </div>
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Per side as plates</div>
              <div className="muted small">With Per side on, a weight shows as the plates to load: 70 reads 45 + 25.</div>
            </div>
            <button
              type="button"
              className={`switch${settings.perSidePlates ? ' on' : ''}`}
              role="switch"
              aria-checked={!!settings.perSidePlates}
              aria-label="Per side as plates"
              onClick={() => update({ perSidePlates: !settings.perSidePlates })}
            />
          </div>
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Keep the screen on</div>
              <div className="muted small">During a workout, so your phone doesn't lock between sets.</div>
            </div>
            <button
              type="button"
              className={`switch${settings.keepAwake !== false ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.keepAwake !== false}
              aria-label="Keep the screen on during a workout"
              onClick={() => update({ keepAwake: settings.keepAwake === false })}
            />
          </div>
        </div>

        {isNative && <WeightStepCard />}

        <NotificationsCard />

        {healthSupported && <AppleHealthCard />}

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Appearance</div>
          <div className="muted small">System follows your device's light or dark setting. Bamboo is a warm off-white.</div>
          <div style={{ marginTop: 12 }}>
            <ThemePicker />
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 20 }}>Accent colour</div>
          <div className="muted small" style={{ marginBottom: 14 }}>
            Also on the lock screen, the widget and your Apple Watch.
          </div>
          <AccentPicker />
          {isNative && (
            <div className="spread" style={{ flexWrap: 'nowrap', marginTop: 20 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Match the app icon</div>
                <div className="muted small">
                  The home-screen icon takes your accent and theme. It changes once you leave Settings, and iPhone lets
                  you know each time.
                </div>
              </div>
              <button
                type="button"
                className={`switch${settings.appIconMatches ? ' on' : ''}`}
                role="switch"
                aria-checked={!!settings.appIconMatches}
                aria-label="Match the app icon"
                onClick={() => update({ appIconMatches: !settings.appIconMatches })}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Intro</div>
              <div className="muted small">How routines, workouts and exercises fit together, and a quick way to set up a routine.</div>
            </div>
            <button className="btn btn-sm" onClick={() => {
                if (sessions?.some((s) => !s.finishedAt)) notify('Finish or cancel your workout first to see the intro');
                else update({ introDone: false });
              }}
            >
              Show again
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Your data</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {signedIn
              ? 'Synced to your account and available offline. You can still export a backup file.'
              : 'Stored on this device only. Export a backup to keep it safe or move it.'}
          </div>
          <div className="row-wrap" style={{ marginTop: 16 }}>
            <button className="btn btn-sm" onClick={exportData}>
              <Download size={15} /> Export backup
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Restore backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importData(f);
                e.target.value = '';
              }}
            />
          </div>
          {import.meta.env.DEV && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
              onClick={async () => {
                if (!(await confirm({ title: 'Load demo data?', message: 'Replaces all data with demo data.', confirmLabel: 'Replace', danger: true }))) return;
                const { demoSnapshot } = await import('../data/demo');
                await repo.importSnapshot(demoSnapshot());
                setStatus('Demo data loaded.');
              }}
            >
              Load demo data (dev only)
            </button>
          )}
          {status && <div className="small" style={{ marginTop: 12 }}>{status}</div>}
        </div>

        <PrivacyCard />
        {MEDIA === 'repdb' && <CreditsCard />}
        {signedIn && <AccountCard />}
      </div>
    </>
  );
}

/** The privacy policy (a static page, public/privacy.html), and deleting the account. */
/** The Apple Watch's Crown step for a set's weight, in the display unit; any amount above 0. */
function WeightStepCard() {
  const { settings, update } = useSettings();
  const unit = settings.unit;
  const step = weightStepFor(settings);
  const [text, setText] = useState(String(step));
  // Follows a change of unit, or one made on another device.
  const [shown, setShown] = useState(step);
  if (shown !== step) {
    setShown(step);
    setText(String(step));
  }
  const save = () => {
    const value = Number(text.replace(',', '.'));
    if (!(value > 0) || value > 1000) {
      setText(String(step));
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    setText(String(rounded));
    if (rounded !== step) update({ weightStep: { ...settings.weightStep, [unit]: rounded } });
  };
  return (
    <div className="card">
      <div className="spread" style={{ flexWrap: 'nowrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Apple Watch weight step</div>
          <div className="muted small">How much a turn of the Crown changes the weight. Default {DEFAULT_WEIGHT_STEP[unit]} {unit}.</div>
        </div>
        <div className="affix" style={{ width: 96, flex: 'none' }}>
          <input
            className="input"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`Weight step in ${unit}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="suffix">{unit}</span>
        </div>
      </div>
    </div>
  );
}

function PrivacyCard() {
  // In the iPhone app a link would replace the app in its web view, so it opens in Safari instead.
  const policy = isNative ? `${SITE_URL}/privacy` : '/privacy';
  return (
    <div className="card">
      <div className="spread">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Privacy</div>
          <div className="muted small">What’s stored, where, and how to delete it.</div>
        </div>
        <a className="btn btn-ghost btn-sm" href={policy} target="_blank" rel="noopener">
          Privacy policy
        </a>
      </div>
    </div>
  );
}

/** Credits for what the app shows from others: RepDB's free tier requires this one, visible to users. */
function CreditsCard() {
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15 }}>About</div>
      <div className="muted small" style={{ marginTop: 2 }}>
        Exercise pictures and instructions: Exercise data by{' '}
        <a href="https://repdb.co" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
          RepDB (repdb.co)
        </a>
      </div>
    </div>
  );
}

/** Using the app without an account: sign in to sync (and back up) what's on this device. */
function SignInCard() {
  const { signIn, error } = useAuth();
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15 }}>Account</div>
      <div className="muted small">
        Your workouts are only on this device. Sign in to keep them in sync across devices and safe if you lose this one.
      </div>
      <div style={{ maxWidth: 320 }}>
        <SignInButtons onSignIn={signIn} />
      </div>
      {error && (
        <div className="small" role="alert" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Settings → Notifications: All, None or Choose (core/notifications.ts). Sent by the iPhone app only. */
function NotificationsCard() {
  const { settings, update } = useSettings();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void notificationsAllowed().then(setAllowed);
  }, []);
  // Not chosen yet: shown as what happens now (rest alerts only).
  const value: NotificationSettings = settings.notifications ?? { mode: 'choose', kinds: { rest: true } };
  const change = async (next: NotificationSettings) => {
    update({ notifications: next });
    if (isNative && anyNotificationOn(next)) setAllowed(await askNotificationPermission());
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15 }}>Notifications</div>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {isNative ? 'What the app may tell you, even when it’s closed.' : 'Sent by the iPhone app; the choice is shared with it.'}
      </div>
      <NotificationChoice value={value} onChange={(next) => void change(next)} />
      {isNative && allowed === false && anyNotificationOn(value) && (
        <div className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
          Notifications are turned off for {APP_NAME} in the iPhone’s Settings, so none will show.
        </div>
      )}
    </div>
  );
}

/** Who you're signed in as, with Sign out and Delete account: at the bottom, out of the way of the profile. */
function AccountCard() {
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;
  return (
    <div className="card">
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Account</div>
          <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Signed in as {user.email ?? user.name ?? 'you'}
          </div>
        </div>
        <button className="btn btn-sm" onClick={signOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
      <div className="spread" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--card-border)' }}>
        <div className="muted small" style={{ flex: 1, minWidth: 0 }}>
          Deletes your account and all its data.
        </div>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
          Delete account
        </button>
      </div>
      {deleting && (
        <DeleteAccountDialog
          email={user.email}
          onClose={() => setDeleting(false)}
          onDelete={() => {
            setDeleting(false);
            void deleteAccount();
          }}
        />
      )}
    </div>
  );
}
