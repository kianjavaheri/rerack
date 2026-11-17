# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rerack (renamed from LiftTrack; `APP_NAME` in `src/config.ts`; the repo, bundle ID and Firebase project still say
`fitness-tracker`, and localStorage keys keep their `lifttrack:` prefix so settings survive), a
personal workout tracker (React 19 + TypeScript + Vite). Meant to replace a notes app for logging lifts: plan
workouts/routines, check in to log sets, view progress charts. A web app (also installable as a home-screen PWA) plus
an iPhone app: a Capacitor shell in `ios/`, shipped through TestFlight, with an Apple Watch app (see **iPhone app** below and the README).
The user commits and deploys themselves; never offer to.
Plans on hold (social backend on Postgres/Redis/CDN, Android) are in `TODO.md`.

## Commands

```bash
npm run dev            # http://localhost:5173 (sign-in required if .env.local has Firebase config, else local-only)
npm run build          # tsc -b && vite build — the type check is part of the build
npx tsc -b             # type check only
npm run lint           # oxlint (.oxlintrc.json)
npm run emulators      # Firebase auth :9099 + Firestore :8080 + UI :4000 (needs Java)
npm run dev:emulator   # app wired to the emulators via .env.emulator (demo project, no real Firebase)
node scripts/build-exercise-catalog.mjs <exercises.json>   # regenerate src/data/exerciseCatalog.json
npm run deploy         # build + Firebase Hosting + Firestore rules (project in .firebaserc; needs `npx firebase login` once)
npm run icons          # regenerate home-screen/PWA PNGs in public/ from public/app-icon.svg
npm run ios            # build, sync into ios/ and open Xcode (Archive there to upload to TestFlight)
npm run ios:live       # phone app loads the Vite dev server (edits show in seconds); Ctrl+C undoes it
```

**Installable app (PWA).** `vite-plugin-pwa` (in `vite.config.ts`) generates the manifest and a service worker that
precaches the app shell, so the home-screen app opens with no signal (data offline comes from Firestore's persistent
cache). `registerType: 'prompt'` with no UI: a new version waits until the app is fully closed, so it never reloads
mid-workout. `/__/` (Firebase Hosting's sign-in handler) is excluded from the navigation fallback — keep it that way.
The service worker only exists in builds; test it with the `preview-build` launch config.

**Website landing page and the app share `index.html`.** The app's Home is `/home` (`HOME_PATH` in `src/config.ts`);
`/` on the website is a landing page. The inline script in `index.html`'s head decides before anything loads: on the
web (not the iPhone app, not the home-screen web app), `/` for a browser that has never used the app, and `/about`
for anyone, adds `html.landing`; then a script at the end of `<body>` replaces `#root` with `<template id="landing">`
and `src/main.tsx` doesn't import the app at all (`src/boot.tsx` is the app's real start, loaded dynamically, with
`index.css`). Otherwise `/` is `replaceState`d to `/home`, and the router's index route also redirects there (the
iPhone app starts at `/`). "Used the app" is localStorage `rerack:app-user` (`APP_USER_KEY`), set by Layout once
past sign-in (or local mode); deleting the account clears it and goes to `/`. So no hosting or service-worker
changes: `/about` and every app path fall back to the same `index.html`. Landing styles: `src/landing/landing.css`,
linked from `index.html` for every page and scoped to `html.landing`. It has its own light/dark switch (sun/moon in
the top bar, remembered as localStorage `rerack:site-theme`, apart from the app's setting; else the app's theme or
the system's), and each screenshot has a dark (`name.webp`) and light (`name-light.webp`) version that the script
swaps (`img[data-shot]`; the other theme's are prefetched after load). Screenshots: `public/landing/*.webp`
(780 x 1594, the app at 390 x 797 with demo data, drawn under a fake status bar in CSS phone frames; excluded
from the precache). The demo account behind them follows a Mon/Wed/Fri Push / Pull / Legs for 26 weeks, generated
with a few missed sessions and some a day late, weights climbing with two lighter weeks (rebuild it in the
`web-shots` origin rather than relying on `src/data/demo.ts`, whose dates don't match those planned days); `public/landing/og.png` is the link preview (`node scripts/landing-og.mjs`). To retake shots use
the `web-shots` launch config (:5176, its own origin, so loading demo data there doesn't touch `web-local`'s), load
demo data, `standalone` class, viewport 390 x 797, finish animations before each capture. The same shots, as PNGs (`<name>-dark.png` /
`<name>-light.png`), go in `portfolio/screenshots/`. Taking them late at night, the page's `Date` can be swapped for a
subclass whose `now` is an evening, so times and the greeting read naturally. The sign-in screen links
back with "What's Rerack?" (`.web-only`, hidden when installed). A back-to-top button (`.lp-top-btn`: a rounded square in the
app's rainbow, orange in dark and blue in light, like the tab bar's +) shows at the bottom right once the first
screen has scrolled away; the footer leaves room under its links for it. The PWA manifest's `start_url` is `/home`.

There is no test suite. Verify changes in the browser; in dev, **Settings → Load demo data** (or importing
`src/data/demo.ts` and calling `repo.importSnapshot(demoSnapshot())`) gives ~10 weeks of history to look at. When
driving `repo` from the browser console after hot reloads, import the exact URL the app uses
(`performance.getEntriesByType('resource')` shows e.g. `/src/data/index.ts?t=…`) or reload first: a plain
`import('/src/data/index.ts')` can be a second instance whose writes reach IndexedDB but never notify the UI.
`.claude/launch.json`: `web` (:5173, real Firebase → sign-in), `web-local` (:5175, Firebase key blanked → local-only, no
sign-in; use this for UI checks), `preview-build` (:4173, built app + service worker), `firebase-emulators`,
`web-emulator`, `web-shots` (:5176, like `web-local` on its own origin, for the landing page's screenshots). For phone layouts: resize to mobile and add the `standalone` class to `<html>` (bottom tabs, swipes).
Touch gestures can be driven with `new Touch(...)` + `TouchEvent`. When the browser pane is hidden,
requestAnimationFrame, CSS animations and timers are paused/throttled, so only check end states there.

TS config uses `verbatimModuleSyntax` (use `import type`) and `erasableSyntaxOnly` (no enums, no constructor
parameter properties). Remaining lint warnings (`react(purity)` for `Date.now()` in render, `only-export-components`)
are known and accepted.

## Architecture

**Layers** — keep the dependency direction:
- `src/core/` — pure TS domain logic, no React/storage: `types.ts` (all records are plain serializable data, ISO
  timestamp strings, no classes), `stats.ts` (per-exercise history, e1RM, PRs, routine "up next", workout-level
  indexed progress), `sessions.ts`, `activity.ts` (per-day aggregation, weeks), `similarity.ts` (fuzzy exercise-name
  matching), `units.ts`, `format.ts`. Put new calculations here, not in pages.
- `src/data/` — storage behind the `Repository` interface (`core/repository.ts`).
- `src/hooks/`, `src/components/`, `src/pages/` — UI. Pages only ever talk to `repo` from `src/data/index.ts`.

**Swappable storage.** `src/data/index.ts` exports `repo`, a `SwitchableRepository` that forwards to the active
implementation: `LocalRepository` (IndexedDB via Dexie) when signed out, `CloudRepository` (Firestore under
`users/{uid}/{exercises|workouts|routines|sessions}` + `users/{uid}/meta/settings`) when signed in. `AuthProvider`
calls `setActiveRepository` on auth changes; subscribers stay attached across swaps. `localRepo` is exported
separately for the first-sign-in "copy this device's data" flow (`auth/MigrationPrompt.tsx`).

`CloudRepository` serves reads from an in-memory mirror kept live by `onSnapshot`, applies writes to the mirror
immediately, and debounces the Firestore write per document (500 ms) because the UI saves on every keystroke. Deletes
cancel pending writes and don't await the server (offline-safe). Because a write can still be in its delay when the tab
closes, every queued write is also journaled synchronously to `localStorage` (`fitness-tracker:pending-writes:<uid>`,
merged per key so tabs don't clobber each other). An entry is dropped once Firestore has it (~3 s after handoff, its own
persistent queue takes over) or confirms it. Leftovers are replayed on start only if newer than the server copy: every
document is written with a `_savedAt` stamp, stripped from what the app sees. Replay waits for a snapshot from the
server (not the offline cache), and an entry for a document that was on the server when edited but is gone now was
deleted elsewhere, so it's dropped (`existed`). Dropping an entry never removes a newer one another tab wrote. Listener errors don't blank the app
(`getSyncError()` → `SyncIndicator`). Backup restore validates first (`core/backup.ts` `checkSnapshot`: all four lists, ids, required fields), writes,
then deletes only what the backup lacks.

**Reactivity.** No state library. `useRepoQuery(fn)` re-runs a repository read whenever the repo emits a change.
The shared lists (`useSessions` etc.) pass a cache key, so a newly mounted page starts from the last result instead of
blank (tab switches and swipes draw at once); the cache is dropped when the data source swaps (`repoGeneration`).
Editor pages use `useEditable(load, save)`: local state is the source of truth while editing and every change
persists immediately, so inputs never fight async reloads. It also follows changes made elsewhere (another device or
tab): when the stored record differs from the draft (ignoring `updatedAt`/`lastActivityAt` and key order) and there
was no local edit in the last 2 s, the draft is replaced; deleted elsewhere → not found. So a page left open can't
save a stale copy over newer data. Two devices editing the same record within ~0.5 s is still last-write-wins.

**Sign-in is offered when Firebase is configured** (`.env.local` has `VITE_FIREBASE_*`). `AuthProvider` gates the whole
app: blank → `Splash` (only if restoring takes >400 ms) → `LoginScreen` when signed out, else the app. The sign-in
screen has Continue with Apple / Google (`auth/SignInButtons.tsx`; Apple first and no less prominent, as App Review
requires when Google is offered) and **Use without an account**: `status === 'local'`, remembered per device
(localStorage `lifttrack:no-account`), data in `LocalRepository`, and Firebase isn't even loaded. Settings then shows
the sign-in buttons; signing in from there clears the flag (before the call, so a redirect sign-in comes back to the
normal flow; put back if cancelled) and `MigrationPrompt` offers to copy the device's data. **One account per email**
(Firebase's "Link accounts that use the same email" setting, which must stay on): Apple with an email that already has
a Google account (or the reverse) is refused with `auth/account-exists-with-different-credential`; `session.ts` keeps
the refused credential, `AuthProvider` asks to continue with the other provider, then `linkPendingSignIn` links it, so
both open the same account. Apple's Hide My Email relay addresses never match, so those stay separate accounts. Before any
JS runs, `index.html` shows the same loader (`.boot`: the app mark in a spinning rainbow ring, inline CSS, fading in
after 0.4 s); React replaces it and `Splash` reuses it with matching timing, so a slow start is one steady spinner. The gate sits
above the router, so the requested URL survives sign-in. Returning users are restored automatically from Firebase Auth's
IndexedDB persistence. Sign-out (avatar menu or Settings) flushes queued writes, waits up to 4 s for Firestore to
confirm them (asks before discarding if offline), then `signOutAndClear()` signs out, terminates Firestore, clears its
offline cache and reloads to `/`. Without Firebase config, `useAuth().status === 'disabled'`: no gate, local-only data —
handy for UI work.

**Deleting the account** (Settings → Account card at the bottom, with Sign out and "Signed in as …"; Privacy keeps only
the policy link → Delete account, App Review requires it; first
`components/DeleteAccountDialog.tsx`, where "delete my account" must be typed, like GitHub): `AuthProvider.deleteAccount`
flushes queued writes, covers the app ("Deleting your account…"), then `session.ts` `deleteAccount` re-authenticates
with the account's provider (Apple first if linked; native sheets in the app via `appleSheet`/`googleSheet`, popups on
the web; closing it cancels with nothing deleted), batch-deletes everything under `users/{uid}`, revokes Sign in with
Apple (web: `revokeAccessToken`; app: the sheet's authorization code to `accounts:revokeToken` with `tokenType: CODE`,
like the iOS SDK), `deleteUser`, clears the offline cache and reloads. The data and user deletion were checked on the
emulators; the re-auth sheets/popups weren't (the browser pane can't do popups). **Privacy policy**:
`public/privacy.html`, a static page outside the app (served at `/privacy` by a hosting rewrite, kept out of the service
worker's navigation fallback; the App Store privacy URL is `SITE_URL/privacy`), linked from the same card (opens in
Safari from the app). Keep it in step with what the app collects.

**Crash reporting**: Firebase Crashlytics in the iPhone app only (`@capacitor-firebase/crashlytics`, pinned; SPM
`symlink` option in `capacitor.config.ts` as its README says). The plugin configures Firebase itself and skips it when
`ios/App/App/GoogleService-Info.plist` is missing (download it from the Firebase console's iOS app, then re-run
`scripts/ios-setup-project.rb` to add it to the target and to the dSYM upload phase's inputs). `native/crashes.ts`
(`reportCrashes`, from `main.tsx`) sends uncaught JS errors as non-fatal reports with parsed Safari stack frames, deduped.
No user id or app data is attached. The web has none (Crashlytics has no web SDK).

**iPhone app.** Same web build in a Capacitor shell; see the **iPhone app** section.

**Firebase is lazy.** `auth/config.ts` reads the env vars and must not import the SDK. All SDK usage lives in
`auth/session.ts` + `auth/firebaseServices.ts` + `data/cloudRepository.ts`, reached only through a dynamic
`import('./session')` — keep it that way so the SDK (~190 KB gzip) stays out of the main bundle. Rules:
`firestore.rules`.
To exercise sign-in against the emulators from a script, `signInWithCredential(auth,
GoogleAuthProvider.credential(JSON.stringify({ sub, email, name })))` works with unsigned fake tokens.

## Domain rules that aren't obvious

- **Weights are stored in kg** (`SetLog.weightKg`) and converted only at the UI edge (`core/units.ts`); default
  display unit is lb.
- **A set counts once it has reps > 0 and isn't a warm-up** (`isCompletedSet`) for stats, "Previous", records and
  history. Warm-ups (`SetLog.warmup`, toggled from the set-number menu) show as "W". A set's placeholders (`hint` in
  SessionPage's EntryCard; also what checking it off empty fills in) are the set above this session once anything's
  in it (11 × 10 in set 1 suggests 11 × 10), else last time's same working set. Checking a set stamps
  `SetLog.doneAt` (cleared when unchecked): an exercise's finish time (`entryFinishedAt`, a "✓ 5:12 PM" flare),
  and the list keeps the order things were done in without undoing one you set (`orderByProgress(entries, entryId)`):
  checking a set moves that exercise's group up past the groups just above it that are less far along (untouched <
  under way < finished), nothing else moves. So the next one started takes the next open spot (start 2, then 4 → 2,
  4, 1, 3; finish 4 while 2 isn't → 4, 2), and one you dragged after another stays there (a superset moves as one;
  in progress only, saved, cards slide via `useSlotFlip`; the watch's set ops do the same). Finishing one plays
  `components/DoneBurst.tsx` (a rainbow circle whose check draws itself, a ring, two haptic taps; pointer-events none).
  `lastPerformanceWithDate` takes options: `before` (the session's own start, so back-dated logs look further back),
  `occurrence` (same exercise twice in a workout) and prefers real sessions over imported ones. The ✓ "done" flag drives
  progress while logging: an exercise is done when every set is checked (`isEntryDone`), shown as "2/5 exercises" in the
  session bar. `finalizeSession` keeps everything planned (skipped exercises stay visible when reopened); lists show
  only `loggedEntries`.
- An unfinished session is signalled everywhere: a pulsing blue ring on the tab bar's + (which then opens it) or a
  "● Live" pill in the top nav. A finished session can be resumed (`canResume`/`resumeSession`) only the same day,
  if it was logged live and nothing else is open. Resuming keeps how it was (`Session.resumedFrom`), so Cancel workout
  puts it back (`cancelResume`) instead of deleting a logged workout.
- **Forgotten workouts**: every save from the session page stamps `Session.lastActivityAt`. An open session with no
  changes for 3 hours (`forgottenSession`) gets a prompt from any page (`components/ForgottenWorkout.tsx`): finish at
  the last change, keep going (re-stamps), or discard — only offered when nothing was logged. Never auto-finished.
- A **Session** with `finishedAt === null` is in progress; `live === false` means logged after the fact (no timer or
  duration; `finishedAt` is set to `startedAt`).
- **Routines** hold ordered `workoutIds` plus optional `days[workoutId]` (0 = Sun), or `every[workoutId]` (that workout
  every N days), or `rotateEvery` (the whole routine in rotation, one workout every N days, in order; overrides the
  others, which are kept). The "every" kinds count from when it was last really done, so a late workout moves the rest
  along; `scheduledOn` is the one place that works out a date's plan (Home, week strip, Check in, "x of y planned").
  Set in the routine editor (Schedule card: By day / In rotation; under each workout's weekdays, set apart by a line,
  a dashed "Every few days" button and an **Optional** switch). **Optional** (`Routine.optional[workoutId]`, per
  routine, so Upper B can be optional in one and required in another): still drawn on its days (a dashed ring in the
  week strip, an "Optional" tag in the editor and on Check in) but never counted as planned or missed (`requiredOn`
  for counts, reminders and the widget; `plannedOn` marks it), and "Up next" skips it unless it's the only one
  planned today. Carried by share links (`p`) and Duplicate. "Up next" (`nextWorkoutInRoutine`)
  returns a workout planned for today, else the one after the last done from that routine (in rotation, always the next
  in order, with its day from `nextPlannedDay`), else **null** — never
  guess when there's no basis. Only the **followed** routine (`followedRoutine`: `settings.activeRoutineId`, or the
  only routine if there's one) drives Home's "Up next", the week strip's planned days and Check in's badges; with
  several and none picked, Home asks you to pick one (the circle on routine cards in Workouts).
- **Notes are sticky**: `Exercise.notes`/`links` and `Workout.notes` show every time it's logged (session note pads,
  Exercises form, workout editor). Links are http(s) only via `normalizeLink`. `WorkoutExercise.notes` is the
  separate per-slot note (e.g. "(slow)" from imports) shown under the exercise name. A note pad with text has a
  **Clear** under it (`NoteText` in `components/Notes.tsx`), with an Undo banner.
- Progress metric for one number per session (`progressValue`): estimated 1RM (Epley) for weighted exercises, total
  reps for bodyweight. Analytics is one page (Records was dropped; Log is its own tab, and the old
  `?view=log` redirects there). It lists logged workouts and exercises together (one filter; `?workout=` or `?exercise=`, else the latest workout). A workout plots each exercise as % change from its first session so
  different loads share one axis (no dual axes).
- **Exercise library**: `src/data/exerciseCatalog.json` is generated from free-exercise-db (Unlicense; stretching
  excluded) and lazy-loaded by `data/catalog.ts`. Picking a library entry copies it into the user's list with
  `catalogId`. `linkToCatalog` converts/merges a personal exercise into its library version, keeping its id (so history
  is preserved) or remapping sessions/workouts when merging into an existing one. Exercises are soft-deleted
  (`archived`) so history keeps resolving. **Merging** (`data/merge.ts` `mergeExercises`, logic in
  `core/exerciseMerge.ts`): points every session entry and workout slot at the kept exercise, adds the others' notes
  and links, archives them, and returns an Undo that restores exactly what changed. The Exercises page lists names
  that appear more than once (`duplicateGroups`; keeper = library-linked, then most logged, then oldest) with Merge /
  Merge all, and the exercise form has "Merge into…" (picks the target with `ExercisePicker`). `linkToCatalog` uses the
  same merge.
  Library exercises have photos (start and end of the movement, `<id>/0.jpg` and `/1.jpg` in free-exercise-db; a few
  are `noPhotos`), loaded from jsDelivr pinned to one dataset commit (`exercisePhotos` in `data/catalog.ts`; too many
  to bundle) and kept by the service worker once seen. `components/ExercisePhoto.tsx`: `ExerciseThumb` in the picker
  rows and on exercise cards (session, workout editor; a dumbbell when there's no photo or it fails), and tapping it
  opens `ExercisePhotos`, which alternates the two, with what it works and step-by-step instructions below
  (`loadExerciseInfo`: free-exercise-db's own `<id>.json` on jsDelivr, fetched on open, cached by the service worker;
  `ExerciseMedia.infoId` carries the library id even while the GIF is shown). Which entry's photos: `photoIdFor` (the exercise's `catalogId`,
  else the starter exercise's entry from `STARTER_CATALOG_IDS` in `data/seed.ts`, else a library exercise of the same
  name), display only. Starters are created linked now; older ones weren't.
  **Beta only:** `USE_ANATOMICAL` (`data/catalog.ts`) shows ExerciseDB's free V1 anatomical GIFs (3D figure, working
  muscles red, 180×180 on white, from static.exercisedb.dev) instead, through `exerciseMedia` (components use
  `useExerciseMedia`). Matching by name is `core/gifMatch.ts` (word coverage, variant words like incline/jump/lying
  penalised, equipment from the field or the name, "flat"/"bench" ignored, Hammer Strength = machine, rear delt fly =
  reverse fly; at least 60% of our words must appear). The library is matched ahead of time with hand-picked
  overrides (`node scripts/match-exercise-gifs.mjs <exercisedb.json>`, which imports the same TS →
  `src/data/exerciseGifs.json`, 514 of 753); exercises you named yourself are matched in the app against
  `src/data/exerciseGifIndex.json` (lazy, ~70 KB). The V1 list is `oss.exercisedb.dev/api/v1/exercises`, 25 per page,
  Cloudflare rate-limited (and 403s Python's user agent; use curl). Their licence for apps is unclear ("All rights
  reserved"), so the user plans to turn it off (or license them) before distributing. While it's on, unmatched
  exercises show a dumbbell, not their photo (one style only); off, photos again (`.no-picture` is the dumbbell tile;
  not `.empty`, which is the app's empty-state box). The photos look like Bodybuilding.com's despite the dataset's
  Unlicense, so check before a public App Store release. With nothing typed, the picker lists `POPULAR_IDS` under
  your own exercises ("Common exercises"), since a new account has none.
- **Import from notes** (`/edit/import`): `core/importParser.ts` parses pasted text (headings, `2x8`, `3 sets of 10`,
  `70/140`, `45+10+10`, `(notes)`, trailing `or`) → `data/importPlan.ts` builds a review draft with matches and flags
  (`reps`, `missing`, `weight`, `match`, `alternative`) → `pages/ImportPage.tsx` blocks saving until every flag is
  resolved. A single rep number like `2x8` is treated as what was done, not a target range; all those questions are
  answered together. Optionally the noted weights are saved as a past session so "Previous" is filled in. Those are
  **Log-only records** (`Session.imported`, older ones only by their note; `isImportedSession`), as are numbers typed
  into the Log: never workouts. Nothing that lists or counts workouts may show them (Recent, History, Analytics,
  heatmap, week strip, "Trained today"), or each would be a stray "workout" whose deletion loses the numbers (that
  shipped once). They fill the Log, Last and the placeholders. Without a real date (`isUndatedSession`; `startedAt`
  is a placeholder) they show "No date" and rank after anything dated (`pastOrder`).
- **Workout and routine names are unique** (case-insensitive; `core/plan.ts`): a taken or blank name becomes the next
  free one ("Upper A 2") on blur/save, and new/imported ones get a free name. Workouts can be shared by routines;
  adding one that's already in another routine asks "same workout" vs "add a copy" (`cloneWorkout`), and the workout
  editor's Duplicate becomes "Separate copy for <routine>" when opened from a routine that shares it. Deleting a
  routine offers to delete workouts used only by it (sessions are always kept).
- **Press-and-hold menus**: workout cards (Plan, Check in), routine cards (Plan) and session cards (Home's Recent workouts, History) open an
  iOS-style context menu on press-and-hold or right-click (`useLongPress`, with a haptic → `components/ContextMenu.tsx`,
  which lifts a copy of the card over a light blur, sized from `offsetWidth/Height` since a held card is shrunk by
  `:active` and a copy that size wrapped its text out of the bottom; actions in `components/WorkoutActions.tsx`: Edit (opens the editor
  with `?from=` the current page), Share and **Duplicate** for workouts/routines, Rename, Delete). Duplicating a
  workout opens the copy's editor; a routine asks first (`components/DuplicateRoutineDialog.tsx`: copy its workouts
  too, or share the same ones; `cloneRoutine` in `core/plan.ts` keeps days, every and optional), also from the
  routine editor's Duplicate button. On Check in, where tapping a card
  starts the workout, a routine's heading can be held too (`.routine-heading`). The menu's icons are our own filled
  drawings in the manner of iOS's (`components/MenuIcons.tsx`: share, trash, edit, rename; SF Symbols themselves may
  only be used in apps on Apple's platforms, and this is web code), with no dividers between the actions. Routine
  delete there and in the editor is `components/DeleteRoutineDialog.tsx`; deleting the followed routine follows the
  one trained from most recently instead (else the newest), so Home isn't left without one.
  The touch that opens a menu carries on after it opens, so the tab and edge swipes also check for `.ctx-overlay`
  while a touch moves, not only where it starts.
- **Hold and drag to reorder** (`hooks/useDragReorder.ts`): workouts in the routine editor and exercises in the
  workout editor (held anywhere on the card but a field; `.holdable` cards keep their inputs selectable), and
  exercises in a session (anywhere on the card). Held on a button, link or field it doesn't start (`startPress`). The workout editor's exercise cards also have **Replace** (⇄ beside
  the superset link: the exercise search, keeps sets/reps/notes, Undo). After 350 ms still the item lifts with a haptic, the page stops
  scrolling by touch (touchmove `preventDefault`) and scrolls itself near the screen edges, the others slide aside, and
  letting go calls the same move as the arrow buttons (`move` / `moveUnlinked`). Moving first is a scroll. Slides
  and the drop use an even 280 ms ease-in-out (the app's front-loaded `--ease` at 0.2 s looked like popping), and
  offsets are cleared with transitions off before the list re-renders (else cards jump past and slide back). Every
  press-and-hold in the app gives a haptic when it takes effect. A press must never outlive its touch: while one is
  going its document `touchmove` handler blocks scrolling, and once a press whose `pointerup` never arrived (the
  element under the finger removed, e.g. deleting sets) left the page unscrollable while tab swipes still worked. So
  it also ends on `touchend`/`touchcancel`, any other pointer going down, blur or the page hiding, and a new press
  ends a stale one. Page scroll locks behind dialogs, menus and windows go through `utils/scrollLock.ts` (counted;
  each saving and restoring `body.style.overflow` could restore "hidden").
- **No calories**: tracking them (typed in, or from Apple Health) was tried and dropped; typing them in wasn't worth
  the space. Reading Health is possible now that there's a paid Developer account, if it's ever revisited.
- **Duration**: `Session.durationMinutes` overrides the timer (null = deliberately none); back-logged sessions have
  none unless typed in. Use `sessionDurationMinutes`.
- **Exercise form** (`components/ExerciseForm.tsx`): besides name, muscle group and Weighted/Bodyweight, **Equipment**
  (Barbell, Dumbbell, Machine, Cable, Other; weighted only; `Exercise.equipment`, the library's own spelling) and
  **Movement** (Compound/Isolation, `Exercise.isolation`). Both show their current value (its own, the library's, or
  guessed from the name: `guessEquipment`/`equipmentOf` in `core/lifts.ts`, `useIsIsolation`) and are saved only when
  tapped, so untouched ones keep following the library and name. Barbell is what gives Per side and the plate list
  (`isBarbellExercise`); Movement picks the default rest (and reaches the watch through `useIsIsolation`).
- Defaults for new exercise slots live in `src/config.ts` (`DEFAULT_SETS = 2`, `DEFAULT_REPS = '6-12'`).

## Naming / routes (user-facing names differ from early code names)

- Nav: **Home | Workouts | Analytics | Log**, then the avatar account menu (Settings, Sign out) — or a gear icon in
  local-only mode — and the Light/Dark toggle. Home is `/home` (`/` is the website's landing page). Home's orbs: Check in, Workouts, Analytics, Log. The favicon link in `index.html` carries `?v=`: bump it when the icon changes (browsers cache favicons on their own).
- Opened from the home screen (`html.standalone`, set by the inline script in `index.html` from
  `display-mode: standalone` / `navigator.standalone`), the top nav and Home's orbs are hidden and a floating bottom
  tab bar (`.tabbar`, Clock-app style, icons only, liquid glass) shows Home, Workouts,
  a rainbow + (Check in), Analytics, Log. Your account is a glass circle at the top right of each tab page's title
  row, like Apple TV / HBO Max (`components/AccountButton.tsx`; app only, the web has the nav's account menu). It's one
  button for all the tabs (`FloatingAccountButton`, in Layout, portaled to `<body>` at page coordinates from layout
  offsets), placed over the current page's empty `AccountSlot` (in `PageHead`, and Home's greeting), so it stays still
  while pages swipe under it and still scrolls with the page. Scrolled out of sight (`html.account-offscreen`), a page
  swiping in shows the still copy in its own slot (`.account-ghost`, only in `main.swipe-peek`), so the button comes
  in with the page instead of popping in once the swipe ends; hidden where there's no slot (a workout, Settings); it opens Settings, which in the app is a sub-page with Back and edge swipe. In the home-screen web app a solid strip
  (`.statusbar-scrim`) covers the status bar plus ~32px because iOS blurs that band and it can't be turned off; the
  iPhone app (`html.native`) has no blur, so its strip only backs the status bar and content starts just below.
  Bottom `.sticky-bar`s sit above the tabs. To test in a browser, add the `standalone` class to `<html>`.
- "Workouts" → `/workouts` (`PLAN_PATH`) → `pages/WorkoutsPage.tsx` is the plan only: routines, workouts
  (`WorkoutPlan` in `EditWorkoutsPage.tsx`). Its top row is a **Programs | Exercises** switch (`.plan-switch`) whose
  list opens right under it (`ProgramList`, or `ExerciseLibrary` from `ExercisesPage.tsx`; nothing chosen at first,
  tapping the chosen one puts it away) and **Import from text** on the right (it was "Import from notes"). `/edit` redirects there; editors keep
  `/edit/workouts/:id`, `/edit/routines/:id`, `/edit/exercises`, `/edit/import` and return to it.
- What you've logged lives on Home: **Recent workouts** (the last 4, `RecentWorkouts` in `WorkoutLogPage.tsx`) under
  Activity, with "See all" → `/history` (`HistoryPage`: every session by month, a sub-page with Back and edge swipe).
  Finishing a workout opens its summary as a page of its own over the app (`components/SummaryWindow.tsx`,
  `openWorkoutSummary(id, celebrate)`, rendered once in Layout so it doesn't depend on which copy of SessionPage is
  mounted; the intro's window classes): the rainbow check pops and draws itself, rings, sparks, "Workout done" and
  three haptic taps, then the summary; × or Done closes it onto the finished workout (which replaced the live page).
  Every finished session with sets shows `components/WorkoutSummary.tsx` at the top (`core/summary.ts`
  `workoutSummary`): Time, Sets, Volume, Exercises as four small tiles in one row (Volume widest) vs the last time that
  workout was done, so History has it for all; its expand button opens the page again (no celebration), which alone
  adds each exercise's sets and up/down/same/"New" by best e1RM, or reps for bodyweight (the workout's own page shows
  the sets below). No sparkle icons: they read as AI. A finished workout has no bottom bar (an "x/y exercises"
  count read as still under way): Resume and Done are at the top right, + Exercise beside Delete session at the
  bottom. Done goes back, else to History.
- A logged session is `/session/:id`; check-in is `/check-in`. Use "Cancel workout" (not "Stop") for discarding an
  in-progress session — `components/CancelWorkoutButton.tsx` uses an in-app dialog, not `confirm()`; from the
  workout's page it returns to Check in. Under a live workout's exercises the same thing is a full-width
  **Cancel workout** too (`wide`, `.discard-btn`; it was a trash icon in the bottom bar, then "Discard workout"), with
  the very same dialog as the top one; the dialog is what stops an accidental tap. It comes before the bottom bar, which is the page's last thing so it never parks above it; in the
  app the bar has `margin-bottom: -38px` so it stays at its stuck spot at the page's end instead of rising. The bar
  reads time so far first, to the second and in `--ink-grad` (`Elapsed`: "8m 32s", `.bar-time`), then a small gray
  `|` (`.bar-sep`) and "0/6 exercises"; under 440px + Exercise is just + so that fits, and the left side truncates rather than running under
  the buttons.
- Editor pages accept `?from=<path>` so Save returns to where the user came from (e.g. back to a routine); validate it
  with `safeReturnPath` (rejects `//host`). Session pages go back with `navigate(-1)` when `canGoBack()`.
- **No `confirm()`/`alert()`**: `components/Feedback.tsx` (`useFeedback`) gives in-app `confirm({…})` dialogs and
  `notify(msg, { undo })` banners. Banners are `width: max-content` (with `left: 50%` a shrink-to-fit box only gets half the
  screen) and clamp to two lines; a pull up (past 30 px, or a flick) swipes one away, a pull down springs back
  (`ToastBanner`). Deletes act at once and offer Undo; only irreversible things (backup restore,
  signing out with unsynced changes) ask first. Starting a workout while one is open goes through `useStartSession`.
- **Live workout page**: no date/time row (the bottom bar has the time so far; back-logged and finished ones show the
  date fields: just Date and Time, no Today/Yesterday shortcuts, a new log starting at now) and no "tap the check" hint; the Live / Done badge sits right after the name (`.session-name` grows
  with the text). An exercise card (`EntryCard`): on the left its picture, then the name with small gray text under it ("Last 3d ago",
  `shortAgo`, or "First time"; once finished "✓ 5:12 PM · Last …"), and on the right a two-column grid
  (`.entry-actions`): its rest chip over a **Notes** chip (icon and the word, `NotesButton withText`), both as wide as
  the wider so they line up, and a vertical ⋮ over **Last** (a white circle, lucide `History`; opens the history). The grid's Set and Done headers are centred over their
  columns (`text-indent` makes up for letter-spacing's trailing gap). The ⋮ opens `components/ActionSheet.tsx` (a sheet with one grouped list, hairlines between rows: Replace
  exercise, Add to superset (the same search as its Superset pill), Progress, Remove exercise in red). The set
  grid's **Reps** header is plain text with a small gray target button beside it (`.target-btn`), which opens `components/TargetSheet.tsx` ("Aim for 6-12 reps per set", From / To number
  fields since iOS's number pad has no hyphen; changes `SessionEntry.targetReps` for this workout only, not the saved
  workout), and on barbell lifts the **Weight** header is a button (`.head-btn`), the Per side switch ("Weight" ↔ "Per side", rainbow when on). **Add set** is a gray button across
  the row with its label centred, the superset link after it. The set menu's warm-up item says "Working set" to go
  back.
- **During a workout**: the set number is a menu, drawn as a small rounded button with a chevron under the number
  (a plain number didn't read as tappable) (`SetMenu`: warm-up, drop set, plates per side via `core/plates.ts`
  for barbell lifts with a Bar picker, delete). **Drop sets** (`SetLog.drop`) count like working sets everywhere
  (stats, records, Last) but show "D" and take no set number (1, D, 2); they still line up with last time's sets by
  position, and "Go up" skips them. **Bar weight** is per exercise (`Exercise.barKg`, unset = 45 lb / 20 kg;
  `barWeight`), used by the plate list and Per side entry (`WeightInput`'s `bar`). Checking a set starts the rest timer (`Session.restEndsAt`, length `Settings.restSeconds` for compound lifts,
  default 120 s, and `Settings.restIsolationSeconds` for isolation lifts, missing = the compound length; any length up
  to 60:00, typed as minutes and seconds in Settings; 0 = only by hand), except a warm-up or an exercise's last set
  (on to the next exercise) unless `Settings.restAfterLastSet` (the switch under the lengths, which are stacked under
  their labels; the watch follows it via `WatchState.restAfterLastSet`). Isolation = the library's `isolation` flag (free-exercise-db's "mechanic", in
  `exerciseCatalog.json`), else guessed from the name (`core/lifts.ts`; `useIsIsolation`). `Settings.restTimer === false` (the switch in Settings) turns it off entirely: no bar, no rest
chips, nothing starts, nothing on the lock screen. Each exercise can have
its own (`Exercise.restSeconds`, set from the rest chip under its name, `components/ExerciseRest.tsx`; same in every
workout; `restSecondsFor`), which the Settings defaults never override: checking off its set starts that length, and
the bar's Start/Again reuse the last one (`Session.restLength`). Changing it while that exercise's rest
(`Session.restExerciseId`) runs moves the end, keeping the time rested (3:00 with 1:30 left → 2:00 leaves 0:30; worked
out from the start, end − `restLength`, so ±15 s survive; 0:00 ends it). `RestTimer` is a bar under Back, there only while resting
  (`restShown`): by default the top is just Back, Cancel workout and the title row. Checking off a set brings it in;
  it's sticky flush under the status bar / top nav (no gap for the page to show through and be mis-tapped);
  while stuck (`.stuck`) it's edge to edge and square at the top (margin, padding and corners animate into it). Running
  it has ±15 s, Pause and a red Stop at the end (■: ends the rest and the bar goes); paused
  (`Session.restPausedLeft`, seconds left, `restEndsAt` null; the lock screen and watch show no rest meanwhile) it
  has Resume; over, it turns rainbow with Again and goes by itself 15 s later. Coming in or going while scrolled
  down, the page scrolls by its height so what's on screen stays still (Safari has no scroll anchoring).
  `Session.restHidden` (the old × that hid it) is no longer set; a rest started on the phone clears it.
  In the iPhone app the rest also shows on the lock screen, buzzes when over (see **iPhone app**). "Go up to 120 lb"
  (`core/progression.ts`) suggests +5 lb / +2.5 kg when every working set last time hit the top of the rep range
  (barbell lifts: the next load whose plates per side are a multiple of 5 lb / 2.5 kg, so 115 → 125, not 120; gone
  once a working set is logged)
  (off with `Settings.weightSuggestions === false`, the switch in Settings). The
  screen is kept on (`useWakeLock`) unless `Settings.keepAwake === false` (Settings' "Keep the screen on" switch):
  in the iPhone app by turning off iOS's idle timer (`AppScreenPlugin.swift`, counted since the live page can be drawn
  twice), on the web by the Wake Lock API.
- **Supersets**: `supersetNext` on workout slots and session entries links an item to the next (`core/supersets.ts`),
  drawn as a group with a rainbow bar; rest starts only after the group's last exercise. Moving/removing unlinks rather than
  silently re-forming a group. Same UI in the workout editor and while logging (`components/SupersetLink.tsx`): a link
  button at each exercise's bottom right and a dashed **Superset pill** under an exercise (or a group's last one). The
  editor shows every pill at first so the feature is discoverable; while logging they're hidden until the button is
  tapped (`usePills`). The button takes a linked exercise out (`leaveSuperset`: ends unlink in place, a middle one moves
  below; toast "Superset removed" + Undo via `restoreLinks`), else shows/hides its pill. Tapping a pill opens the
  exercise search with the workout's own exercises first, tagged "In this workout" (`supersetWith`: moves that slot in,
  or adds a new one — only to that session, never the saved workout). Holding an exercise and dropping it on a pill
  links it (`useDragReorder`'s `onDropOn`; while hovered the list holds still and the held exercise gets the pill's
  dashed outline, `.drop-ready`, since it covers the pill). Pills are nearly card-wide. An exercise pulled in by
  a drop or a search pick remembers where it was (`origins`, in memory); taking it out puts it back there
  (`placeAfter`), and `useSlotFlip` slides every card to its new place (cards carry `data-slot-id`).
- **Log** (`/log`, its own tab: `pages/LogPage.tsx` → `components/LiftLog.tsx`): the notes-app view. Shows the followed
  routine; picking another routine or workout lasts (per device) until the followed routine changes. Each exercise shows sets, reps and weight from the last day it was
  done (`exerciseDays` in `core/activity.ts`). Its date (rainbow text) opens `DayCalendar` with every day it was done
  highlighted; picking one shows that day (date turns solid rainbow). Columns are fixed widths so the tables line up.
  A row not done yet says so under the exercise's name and has a gray **+ Add** across every column, and a gray
  "No date" one is tappable:
  `components/LogEntryForm.tsx` has a row per set (starting from the slot's `targetSets`; own reps and weight, an empty
  row copies the one above as placeholders; every set needs both, weight optional only for bodyweight), Per side for
  barbell lifts (saved on the entry, so it carries to the next session) and an optional date (iOS draws today in an
  empty date field, so empty it's hidden behind "No date"). `data/logEntry.ts` saves a Log-only record (`dated` if a date was given) and never touches a real workout; the form's
  Remove takes it out, and a dated one is changed from its calendar (`onEdit`). Undo restores exactly what changed.
- **Per side** (the Weight column's header is the switch, barbell lifts only, `SessionEntry.perSide`): the weight field takes one
  side of the bar and shows the total beside it ("35", "= 115 lb"; bar 45 lb / 20 kg from `core/plates.ts`;
  `components/WeightInput.tsx`). The total is always what's stored, and all that history, charts and Last ever show, so
  toggling only changes how the same number reads (115 ↔ 35). It belongs to that one logged workout, never the
  exercise (it was once, and toggling an old day changed every other day). **Per side as plates**
  (`Settings.perSidePlates`, Settings' switch, off by default): while not being typed in, a per-side weight that takes
  two or more plates shows as them (`sidePlatesLabel`: "45 + 25" for 70; three or more packed, "45+10+10+2.5"), in
  13px with the total tucked under it in the same field (`.input.as-display`, `NumericInput`'s `display`); focusing
  it goes back to the plain number. A new session of a workout starts each
  exercise as the newest session of that workout had it (`createSessionFromWorkout`'s `past`).
- **Last** (code still says Previous; the button was briefly "History"): no such column in the set grid (the
  placeholders cover it). Each exercise's **Last** flare opens `components/PreviousLog.tsx`: every earlier day's
  completed sets, newest first, grouped like "2 × 8 · 145 lb" (`exerciseLog`, `groupSets` in `core/stats.ts`). The
  workout-wide one was removed (`exercisesLog` is left unused).
- The exercise search (`ExercisePicker`) focuses its field only with a mouse; on a phone the keyboard waits for a tap.
- **Swipe down to close**: every `Modal` (`hooks/useSwipeToClose.ts`; touch only, with a grabber): from anywhere on
  the sheet unless what's under the finger is scrolled down or is a textarea/select/slider. Past 110 px or a fast flick
  closes it, else it springs back. List sheets pass `expandable` (Add workout, the exercise search, Programs, Last):
  on a phone, pulling up grows the sheet with the finger and past 60 px it settles nearly full screen (`.expanded`,
  empty space below is fine); a pull down from there closes it. The first downward move is `preventDefault`ed before it's a real pull, because iOS
  settles on scrolling at a touch's first move. Full-screen windows (intro, New workout) don't have it.
- **Tabs reset**: a tab button always goes to that tab's root, so a finished workout opened from Home doesn't survive
  leaving (deliberate; the user asked and it stays).
- **Keyboard on iPhone**: iOS shrinks only the visual viewport, so fixed sheets stayed behind the keyboard.
  `utils/keyboard.ts` (`trackKeyboard`, run in `main.tsx`) publishes `--vv-top`/`--vv-height` (dialog overlays are
  sized to them, so a sheet sits on the keyboard), sets `html.keyboard-open`, and scrolls a covered focused field
  into view.
- **Share links**: `/share#2.<…>` (`core/share.ts`) carries a workout or routine (exercises by name/catalogId,
  targets, notes, supersets, routine days) but no history, in a compact form (arrays, short keys, defaults and a
  library exercise's group/equipment left out) deflated with `fflate`'s synchronous `deflateSync` (building it must not
  wait, or iOS won't open the share sheet from the tap) and URL-safe base64: ~1/6 of the old length. Old links (plain
  base64 JSON, no `2.`) still open. **Short links** (`/s/<8 chars>`, what Share makes when signed in): the same encoded
  plan saved in Firestore `shares/<id>` (`{ plan, owner, createdAt }`; `auth/shareLinks.ts` makes the id, unambiguous
  characters, and calls the saver `session.ts` registers when it loads, so no SDK in the main bundle; the write isn't
  awaited, Firestore queues it, so the share sheet still opens from the tap). Rules: anyone can `get` one, only the
  owner can `list` (with an owner filter) or delete, create only (no overwrite). Not signed in: the long link.
  `hooks/useSharedPlan.ts` reads either kind (Firestore readable signed out), used by SharePage (routes `share` and
  `s/:id`) and LoginScreen. Account deletion deletes the user's shares. The privacy policy says so. `data/shared.ts` adds it (matches
  exercises, unique names, fills a library exercise's group and equipment from the catalog).
  In the iPhone app, tapping a `www.rerackapp.net/s/…` or `/share…` link opens it in the app (Universal Links:
  `public/.well-known/apple-app-site-association` with team `78842M9R35`, served as JSON by a hosting header, and
  firebase.json's ignore no longer skips dot-folders; `applinks:www.rerackapp.net` in `App.entitlements`, only www since
  Apple won't follow the apex's redirect for that file; `native/links.ts` opens the same path and fragment). Not
  installed: the website opens as before.
  `components/SharePreview.tsx` shows what it holds (each workout's days, notes and every exercise's sets × reps): on
  the share page above "Add to my workouts", and on the sign-in screen when someone opens a link signed out
  (`LoginScreen`, `.with-share`: "Sign in to add it…"; the address survives sign-in, so the share page follows).
- In the app (`html.standalone`) Home opens with a greeting by time of day plus first name when signed in, and the
  date (`.home-greeting`; hidden on the web, where the top bar and orbs are).
- Home shows a week summary vs last week to the same weekday (`weekSoFar`).
- **New workout** (Workouts' button, and a routine editor's, which adds it to that routine): `NewWorkoutWindow` in
  `components/NewWorkout.tsx`, the intro's window with its name field and tile grid (`WorkoutFields`), saved by
  `data/newWorkout.ts` `saveNewWorkout` (shared with the intro), then on to the workout editor for sets and reps.
  Adding a single exercise to a workout keeps the `ExercisePicker` search. The grid's first tile, **New exercise**
  (and "Add “…”" after a search with no match, named what was typed), opens `ExerciseForm` (`onSaved` reports the
  exercise it ended up as, including an existing or library one chosen instead) and picks it. The window is portaled
  to `<body>`: inside a tab page (its own layer, `will-change`) a fixed window drew under the tab bar.
- **Routine cards** (Workouts): tapping a card follows it (`settings.activeRoutineId`); its pencil (`.routine-edit`)
  opens the editor; press and hold for the menu. Small checked circles use `--rainbow-dot` (a plain diagonal sweep).
  A gradient over a transparent border must be `border-box`: it's otherwise sized inside the border and repeats under
  it, which showed as a square in the circle.
- **Notifications** (`core/notifications.ts`, `Settings.notifications`: mode All / None / Choose + per-kind switches,
  reminder time; missing = not chosen = rest alerts only, as before). Kinds: `rest` ("Rest over", `native/rest.ts`),
  `reminders` (the followed routine's planned days, next 14, at `reminderAt`, default 17:00; today's dropped once
  done; `reminderPlan`), `open` ("Still working out?" 3 h after an open live workout's last change,
  `openWorkoutAlert`). `native/notifications.ts` `useScheduledNotifications` (Layout) cancels and reschedules ids
  2 and 100–113 whenever the plan changes, never prompting; permission is asked by Settings' card and the intro's
  Notifications step (after the routine/program, before "You're set"; Later skips it). Local notifications only, so
  the web just stores the choice.
- **Profile** (the top of the Settings page, which has two headings: "Profile" at the top, then "Settings"
  (`.settings-heading`) over the app's settings; `components/Profile.tsx`; deliberately only there): `ProfileHeader` is laid out like
  Hevy's account header (88px photo, tap to change, with a camera badge; the name over label-over-number stats: only
  Workouts for now, finished sessions with sets and not Log-only records; Followers / Following are planned), and
  `ProfileFields` edits name, height and body weight in a card right under it. Name and photo
  (`Settings.profile`; photo is a 256 px JPEG data URL from `utils/image.ts` `squarePhoto`, so it syncs with settings)
  override the sign-in's everywhere through `hooks/useAccount.ts` (`useAccountUser` for avatars and menus,
  `useFirstName` for greetings); height (ft/in with lb, cm with kg; both take one decimal, so 5 ft 10.5 in); body weight log `Settings.bodyWeights` (one per
  day, `core/body.ts`) with a chart and 30-day change. The Body weight heading (with a chevron) folds away the chart
  and history list, closed at first and remembered per device (localStorage `rerack:body-weight-open`); the latest
  weight, the field and Log always show.
- **Programs** (`data/programs.ts` `PROGRAMS`, generic names only: Beginner Strength, Full Body Starter, Upper / Lower,
  Push / Pull / Legs, Body Part Split): slots by friendly name + library id + sets × reps, weekdays or `rotateEvery`.
  `addProgram` builds a share payload and goes through `addShared` (reuses your exercises by library id or name),
  returns what it made; `removeProgram` is its Undo. `components/Programs.tsx` `ProgramList` (cards that open to
  show workouts and exercises, "Use this program"; the body is always rendered, `inert` while closed, and opens by
  animating a grid row from `0fr` to `1fr`, the one way to animate to its natural height, then scrolls into view) is in the intro's routine step and the Workouts page's Programs side
  (also opened from the empty routines box; `ProgramsWindow` is unused now); using one follows it.
- **First-run intro** (`components/Intro.tsx`, mounted in Layout as `IntroGate`): its own window (full screen on a
  phone, a panel on wide screens; `.intro`, z 90, under dialogs). Explains routine → workout → exercise (a diagram
  with one colour per level, `--lvl-*`), then step 1 names the routine (presets Push / Pull / Legs, Upper / Lower,
  Full Body, whose workout names are suggested in turn), step 2 makes a workout by tapping tiles in
  `components/ExerciseGrid.tsx` (picture, name, a circle that fills with the rainbow; Popular / Yours / muscle-group
  filters, search, and an "Add “…”" tile for a new one; picks keep their tapped order, shown as numbered chips). Each
  workout is saved straight away (library picks adopted, `DEFAULT_SETS`/`DEFAULT_REPS`); the routine is made with
  the first one and followed if none is. Shows once per account (`Settings.introDone`, synced) to accounts with no
  routines or workouts, while no workout is open and not on a share link's page (`/share`, `/s/…`: it covered the
  preview, so a friend's link seemed to do nothing); `introDone: false` (Settings → Intro → Show again) brings it back.
  It covers the whole screen (`inset: 0`, not the `--vv-*` area dialogs use: sized to that, iOS moving it around the
  focused field let the page show through below); with the keyboard up the bottom bar hides (`.keyboard-open`), and
  the grid's search and filters are sticky, scrolled to the top on focus so results fill down to the keyboard. Both
  the welcome step and the routine step offer Import from text (finishes the intro, opens `/edit/import`).
  **Testing:** `SHOW_INTRO_TO_EXISTING = true` also shows it to existing accounts that never saw it; set false once
  tested.
- **Swipes (installed app only)**: an edge swipe goes back on `/session/…` and `/edit/…` pages (`useEdgeSwipeBack`).
  A sideways swipe on Home/Workouts/Check in/Analytics/Log moves to the neighbouring tab like a pager
  (`useTabSwipe`; Check in, behind the rainbow +, is a tab page too, and while a workout is open that workout takes
  its slot: TabPager draws `SessionPage` there with `data-tab="/check-in"` and `data-href` its URL, which the swipe
  navigates to, so you can swipe out of a live workout and back; edge swipe-back stays off on it). Reaching Check in, the tab bar's highlight (`--i`)
  becomes a 54px circle around the 46px + (`--c`: clip-path plus top/bottom), a thin ring in a darker grey (`--tabbar-pill-checkin`, mixed in by `--c`, so it follows a swipe and eases on a tap); it glides between tabs with no overshoot (`--ease-swipe`); it stays there on the workout
  in progress (`activeTab` in Layout; History and a finished workout count as Home). Tab pages stay
  drawn between visits; one that must start fresh each visit reads `useTabActive()` (Check in resets to live/now). It
  has to feel like Apple's Health app: one continuous motion. How it works, and why:
  - The tab pages are drawn by `components/TabPager.tsx` (from `TAB_PAGES` in `pages/tabPages.tsx`), not the router's
    Outlet; App's routes for those paths have `element={null}`. The current tab's neighbours are drawn in idle time
    and, like every tab page once drawn, never unmounted; parked off screen as `.swipe-peek` (fixed, at
    `--pager-top/left/width`), all keyed by path so React keeps each page when its role changes. A parked page clips
    its overflow, so it's the scroller its sticky children measure from: the live workout's rest bar is made
    non-sticky there (`main.swipe-peek .rest-timer`), else it sat a status bar's height too low until it was current. Finishing a swipe
    only swaps which page is current: nothing is rebuilt. Dropping the tab just left (and rebuilding it when idle,
    mid next swipe) caused freezes.
  - A drag moves the page, the neighbour and the tab bar highlight (`--i` on `.tab-indicator`) once per frame
    (requestAnimationFrame, `translate3d`). Every tab page is always its own layer (`will-change` in CSS): promoting
    the page when a drag began repainted it during the first frames. On release they continue at the finger's speed
    from the last drawn position (`settleMs` matches the ease curve's starting slope) and ease to rest over up to
    600 ms with `cubic-bezier(0.3, 0.8, 0.3, 1)` (measured from Health: finger speed held ~100 ms, ~450 ms in all);
    only then does the route change. The tab bar's active icon switches as the drag passes halfway (`markTab`), not
    when the route changes.
  - The router commits navigations as React transitions, a moment after `navigate`. `useTabSwipe` attaches its
    listeners once, reads the current tab from the DOM (`main.tab-page:not(.swipe-peek)`), and ignores new swipes
    until the swiped-to page is current; a swipe in that gap used to move the stale page and leave pages stuck.
  - iOS settles in a touch's first moves whether it scrolls, and once its own pan starts it cancels the touch (the
    swipe moved a little, then snapped back). In the iPhone app `AppViewController` adds a sideways pan recognizer
    (drags flatter than ~63°) that the scroll view's pan must wait to fail: with `alwaysBounceVertical` the scroll
    pan otherwise began on nearly every drag. On the web, tab pages have `touch-action: pan-y` and, while undecided, moves
    leaning sideways (past 3px) are `preventDefault`ed. Direction is lenient because thumbs swipe in arcs: after 10px,
    flatter than ~55° is a swipe, steeper than ~63° a scroll, in between it decides at 24px (a strict 34° rule made
    swipes fail to catch). A touch during the settle catches the page where it is and drags on from there (it can
    finish or undo the move under way, not skip a second tab). The rest of a touch is followed on its target element
    (events stop reaching the document if a re-render removes it); a drag whose end never arrives is put back on the
    next touch.
  - Earlier versions that rebuilt or swapped the page at release stuttered (60–90 ms freezes, blocked scrolls, a
    jump, a lagging tab bar). Don't render pages during or at the end of a swipe.
  - Skips inputs, charts (scrubbing), dialogs, sideways scrollers and `[data-no-swipe]`. `useRepoQuery` caches the
    shared lists so pages draw from data at once. Analytics' code is preloaded in idle time (`preloadTabPages`).

## Styling

- All styling is in `src/index.css` with CSS custom-property tokens; light on `:root`, dark on
  `[data-theme='dark']` (set by `hooks/settings.tsx`, which also keeps the theme choice in localStorage
  `lifttrack:theme` so `index.html` and the loader use it before settings load, not the phone's setting). Look and feel mirrors kianjavaheri.com: Google Sans Flex,
  gradient cards, full-width glass navbar, uppercase underlined CTAs; Antigravity-style round icon "orbs" on Home.
- **The bottom tab bar has its own glass**, after YouTube's bar (`--tabbar-glass/-filter/-edge/-shadow/-pill`): one
  flat tint, no top-to-bottom gradient or top highlight (the user didn't like the light-to-dark fade), a 20px blur and
  an even hairline rim; dark a nearly black tint (`#141416b8`) with a lighter gray pill on the current tab, light a
  see-through cool gray (`#d4d6dc99`) with a darker pill. The current tab's icon is **filled** and the others are
  outlines, like YouTube's (`components/TabIcons.tsx`: filled drawings of lucide's House, Dumbbell, ChartLine,
  NotebookText, in the accent's `#lt-ink`). Each tab draws both and CSS shows one by `.tab.active`, because a swipe
  marks the tab by its class without a re-render (`markTab`).
- **Liquid glass** (iOS 26 look) on the bottom bars, rest bar, sheets and the hold menu: `--glass-filter`
  (strong saturated blur), a light `--glass-tint` (`--sheet-tint` for sheets and menus, which hold more text), a
  `--glass-sheen` gradient and a bright `--glass-edge` rim. Always on a `::before` layer behind the content (text on
  the blurring element goes soft on iOS), and never put `backdrop-filter` on an ancestor of glass (it would stop the
  glass seeing the page): overlays dim without blurring, or blur on their own `::before`. Write `-webkit-backdrop-filter` **before**
  `backdrop-filter`: the other way round, the production minifier (lightningcss) drops the standard one, so Chrome and
  Firefox lose the blur in builds only (dev isn't minified). Check CSS like this in `preview-build`, whose service
  worker may be serving an older build (unregister it first). On phones sheets float 8px
  inside the screen edges with 36px corners.
- Dark mode is near-black with a faint cool tint, after linear.app (`#08090a` base, `#0f1011` panel/app background,
  `~#18191b` cards, `#8a8f98` muted text). The accent is the logo's **rainbow**, its colours
  bleeding into each other rather than in visible bands (the "Rainbow" section of `index.css`; it replaced coral):
  `--rainbow` for fills (a mesh of soft radial patches over a sweep, logo colours `--rb-1..6`, dark `--on-rainbow`
  text on top), `--ink-grad` for text (clipped to the text) with icons drawn through the `#lt-ink` SVG gradient in
  `index.html` (`stroke: url(#lt-ink)`), `--soft-grad` washes on a `::before`, and `.rb-outline` for a rainbow edge
  (a masked `::after`). Dark mode is a warm sweep (orange, salmon, red; little pink); light mode a
  mostly-blue sweep with some depth (indigo, blue, sky; deeper ink for contrast). The lock screen
  (`RestTimerWidget.swift` `Palette`) mirrors both.
  **Purple in dark mode** (being tried out; Settings → Appearance switch, `Settings.darkAccent: 'purple'`, null =
  warm): `[data-theme='dark'][data-accent='purple']` in `index.css` swaps `--accent` and `--rb-*`/`--ink-*` for a
  pink → violet → blue sweep (#ea74fc … #6e81ff, from a swatch the user picked). `hooks/settings.tsx` sets
  `html[data-accent]` and mirrors it to localStorage `rerack:dark-accent`, which `index.html` reads for the first frame
  and the loader ring. The home-screen widget follows it too (`HomeWidgetData.accent`, sent by `native/widget.ts`;
  `Palette.of(dark:purple:)`), and so does the Apple Watch app (`WatchState.accent` → `Theme` in
  `RerackWatchApp.swift`); the Live Activity's watch layout (Smart Stack) too (`ContentState.purple`, from `useNativeRestTimer`); the
  lock screen, Dynamic Island and landing page stay warm.
  The loading ring in `index.html` follows the same split. The logo itself keeps the full rainbow. `--accent` is one solid colour from it (blue in light, pink in dark) for what can't
  take a gradient (focus ring, checkboxes, selection, dashed outlines). Heatmap squares show their part of one
  rainbow across the grid (`--gx/--gy/--gw/--gh`). `--danger` is rose/red. Easing tokens: `--ease`,
  and `--ease-swipe` (`cubic-bezier(0.22, 1, 0.36, 1)`) for page swipes. Charts do **not** use `--accent`: their
  colors are in `components/chartTheme.ts` (blue single-series
  accent and a fixed-order 8-color categorical palette validated for colour-blind separation — don't cycle or
  reorder; >8 series must be capped; dark's 5th is #e07ad0, since #d55181 read as the orange 2nd on a phone).
- Home's Activity heatmap has 1W / 1M / 6M (remembered per device in localStorage): 6M is the compact grid with
  weeks as columns; 1W (a week, captioned "Oct 19 – 25", `weekRange`) and 1M (a calendar month, captioned with its
  name, padded to whole Monday–Sunday weeks with the neighbouring months' dates, faded) are calendars that show the
  date, and scroll sideways back to the first trained day (at most 104 weeks / 36 months), with arrows beside the
  caption. Stats are for the week/month in view (`rangeLayout(range, today, back)`). Home's week strip pages back the
  same way (`WeekPager` in `components/WeekStrip.tsx`): its title is "This week", "Last week", then the dates, and an
  earlier week shows "3 of 5 planned · 33 sets" instead of this week's summary. Both use `hooks/usePager.ts`: a
  scroll-snapped `.pager` (sideways scrollers are left alone by tab swipes) that opens on the newest page; inside a
  grid it needs `min-width: 0` or it grows to fit every page, and each page has 5px padding because the scroller
  clips anything outside it (today's outline in the calendars). No 1Y: 52
  columns are too small to see or tap on a phone.
- Home's activity grid is deliberately two-state (rest gray / trained rainbow): you train at most once a day,
  and set counts mostly reflect which workout it was, so shading by volume was confusing. Don't reintroduce a ramp
  without labelling what it encodes.
- Navbar spans the full width (`.nav-inner`, slim `clamp()` gutter) while page content stays max 1200px; the signed-in
  avatar is 34px with extra spacing around it and the theme toggle.
- The user prefers compact sizing (13px nav, 15px base, 36px buttons) and plain, personal copy — no marketing
  taglines or branding. Check layouts at phone widths: breakpoints are 480/560/820/900/980px; on ≤560px the main
  panel goes edge-to-edge and the hub is a single row.

## iPhone app (`ios/`, Capacitor 8)

Portrait only (Info.plist's `UISupportedInterfaceOrientations`; the PWA manifest has `orientation: 'portrait'`), and `html` has
`-webkit-text-size-adjust: 100%` because iOS enlarged paragraphs when the page turned sideways and they stayed big.
Bundle ID `com.kianjavaheri.fitnesstracker`; home-screen name Rerack; App Store Connect name "LiftTrack: Workout
Log" (to be renamed there by hand) (TestFlight only, internal testing; Xcode Cloud isn't used). iOS 18+, iPhone only.

**Workflow.** `npm run ios:live` (scripts/ios-live.sh) points the app at the Vite dev server on this Mac and opens
Xcode; the user presses Run once with the iPhone selected, then web edits reload on the phone in seconds. Native
changes (Swift, plugins, Info.plist) need another Run. Live reload runs React's slower dev build, so judge smoothness
on a TestFlight build. Stopping it (Ctrl+C) re-copies the bundled config, and Release builds ignore `server.url`
(`AppViewController.instanceDescriptor`): a TestFlight build once shipped pointing at the Mac and showed only the gray
launch screen away from home Wi-Fi. Shipping: `npm run ios` (builds the latest web app into the bundle), then
Xcode → Any iOS Device → Product → Archive → Distribute App → **App Store Connect** (not "TestFlight Internal
Only").
The app bundles the web build: `npm run deploy` doesn't update it. `cap sync` writes `CapApp-SPM/Package.swift` with
the project's iOS 18, which needs swift-tools 6.0 (`swiftToolsVersion` in `capacitor.config.ts`; Capacitor's 5.9 has no
`.v18`). App and widget must keep the same
MARKETING_VERSION / CURRENT_PROJECT_VERSION.

**Native pieces** (each a no-op on the web; `src/native/platform.ts` has `isNative` and `SITE_URL`; `index.html` adds
`standalone` + `native` classes so it looks like the home-screen app):
- `ios/App/App/SceneDelegate.swift` must make `AppViewController()` the root view controller. Capacitor's template
  creates a plain `CAPBridgeViewController()` there (the storyboard is ignored), and then none of our plugins exist —
  JS calls fail with `UNIMPLEMENTED`.
- `AppViewController.swift` registers this app's plugins (`bridge?.registerPluginInstance`) and turns iOS scroll
  bounce back on (Capacitor sets `bounces = false`).
- Keep the screen on: `hooks/useWakeLock.ts` → `AppScreenPlugin.swift` (`UIApplication.isIdleTimerDisabled`).
- Haptics: `utils/haptics.ts` (`haptic`, `hapticAlert`, `prepareHaptic`) → `AppHapticsPlugin.swift`, which plays
  taps through **Core Haptics** (`CHHapticEngine`, fallback `AudioServicesPlaySystemSound(1519)`).
  `UIImpactFeedbackGenerator` (what @capacitor/haptics uses, removed) was accepted but silent in this app on iOS 27.
  Logs `[AppHaptics]` to the Xcode console.
- Lock screen: `native/rest.ts` (`useNativeRestTimer`, mounted in Layout) shows the live workout as a Live Activity
  for as long as it's open, like Hevy: the logo and workout name quietly at the top with the time so far, the exercise
  and set you're on (`currentSet` in `core/sessions.ts`: where the last-checked set was, or the next in its superset,
  so doing exercises out of order is followed; else the first with sets left) with a small picture of it on the left
  (the app saves a 132 px copy, a GIF's first frame, into the app group `group.com.kianjavaheri.fitnesstracker`
  (`ExerciseImages` in `Shared/RestActivityAttributes.swift`; both targets' entitlements; `prefetchImages` fetches a
  workout's ahead of time) since the widget can't download), and while resting the countdown (captioned "REST"; the
  workout's time so far is at the top right, in a footnote-size line with the workout's name and the logo in plain
  white) and a bar in one colour
  from the theme's sweep (`Palette.accent`). A timer `Text` takes all the width it's offered: the countdown is laid
  over a hidden "0:00" so it leaves the exercise's name room (2 lines, shrinking to 80% before truncating), and the
  time so far is capped and right-aligned. Keep timers there plain: a gradient fill or mask on a `Text(timerInterval:)`
  or timer `ProgressView` makes the system flatten it to a still picture, and it stops counting. It follows the app's light/dark theme (`dark` in the content state); dark is pure black, like Hevy's. The lock screen draws its background
  see-through, so light mode adds a white wash (`Palette.wash`) or the wallpaper tints it. (Plugin and type names still say
  "Rest".) It's a Live
  Activity (`RestActivityPlugin.swift`; drawn by the `ios/App/RestTimerWidget` extension;
  `ios/App/Shared/RestActivityAttributes.swift` is in both targets), schedules a local "Rest over" notification
  (independently, so one failing can't block the other; its sound is `ios/App/App/rest-over.caf`, a soft half-second
  two-note chime written by `node scripts/rest-sound.mjs`, bundled by `ios-setup-project.rb`; heard in earbuds, and
  from the speaker unless on silent) and plays `hapticAlert()` if the app is open.
- Google sign-in: Google blocks its web sign-in inside apps, so `auth/session.ts` uses the native sheet
  (`@capgo/capacitor-social-login`) → `signInWithCredential`. Sign in with Apple uses the same plugin's native sheet
  (`apple: true` in `capacitor.config.ts`, `com.apple.developer.applesignin` in `App.entitlements`) with a nonce (Apple
  gets its SHA-256, Firebase the raw one); Apple gives the name only on first sign-in, so it's saved as the display
  name then. On the web it's Firebase's `OAuthProvider('apple.com')` popup. Needs the Apple provider enabled in the
  Firebase console (Services ID + key for the web). Needs `VITE_GOOGLE_IOS_CLIENT_ID` and
  `VITE_GOOGLE_WEB_CLIENT_ID` in `.env.local` (already set); `scripts/ios-google-scheme.mjs` writes the return URL
  scheme into Info.plist. Auth uses `initializeAuth` with IndexedDB persistence (getAuth's popup/redirect iframe
  hangs in the web view).
- Home-screen widget ("Up next", small and medium; `ios/App/RestTimerWidget/HomeWidget.swift`, in the same extension
  bundle as the Live Activity, sharing its `Palette` and `LogoMark`): the followed routine's next workout and when
  (Today / Tomorrow / weekday; today's is skipped once trained), and on medium this week Monday–Sunday (done = filled
  sweep with a check, planned = ring, missed = faint ring, rest = dot) with "2 of 4 done". `native/widget.ts`
  (`useHomeWidget`, Layout) sends 14 days from this Monday (planned names via `scheduledOn`, trained via `doneOn`) to
  `AppWidgetPlugin.swift`, which stores `HomeWidgetData` (`ios/App/Shared/HomeWidgetData.swift`, both targets) in the
  app group's UserDefaults and reloads the timeline only when it changed. The widget works out the day itself, with an
  entry at each midnight, so it stays right while the app is closed (trained-today only updates when the app runs).
  Follows the system light/dark, not the app's setting; dark is black. iOS draws a
  widget's background much lighter than asked: Calendar's own #1F1F1F to #0D0D0D came out #393939 to #1B1B1B, and
  #0F0F0F to #050505 still #2A2A2A to #121212 (measured from home-screen screenshots). Tapping it opens `rerack://check-in` (`widgetURL`; the scheme
  is written into Info.plist by `scripts/ios-google-scheme.mjs` with Google's): `native/links.ts` `useAppLinks`
  (Layout, `@capacitor/app` launch URL + `appUrlOpen`, waits for the sessions) goes to the open workout, else Check in.
  Compile-checked only.
- Apple Health: `native/health.ts` → `AppHealthPlugin.swift` (skips sessions the Apple Watch saved, `savedByWatch`) saves a finished workout (with a duration) as
  strength training, tagged with the session id (`HKMetadataKeyExternalUUID`) so finishing again replaces it and
  deleting removes it (even with saving turned off). Calls run one at a time (two saves at once would each add one);
  editing a finished workout's name, date or duration re-saves it (`syncToAppleHealth`, debounced). Off until turned on in Settings (per phone, localStorage `lifttrack:apple-health`; Health
  permission is per device). Needs `App/App.entitlements` (HealthKit) and the Health usage strings in Info.plist.
- Status bar style follows the theme (`@capacitor/status-bar`). Share links use `SITE_URL`
  (`https://www.rerackapp.net`), not the page origin (`capacitor://localhost`). The site's domain: `www.rerackapp.net`
  (DNS at Squarespace, CNAME to `fitness-tracker-cb4cd.web.app`), with `rerackapp.net` redirecting to it in Firebase
  Hosting; the old `fitness-tracker-cb4cd.web.app` still works, so earlier share links keep opening. Info.plist has local-network keys for live reload and `ITSAppUsesNonExemptEncryption`
  false.

**Project tooling.** `scripts/ios-setup-project.rb` (xcodeproj gem; run with `GEM_HOME=$HOME/.gem/ruby/2.6.0 ruby …`)
adds the app's own Swift files and the widget target to the Xcode project; add new app Swift files to its list and
re-run it (idempotent). `scripts/ios-assets.mjs` (run by `npm run icons`) writes the app icons and a plain dark launch
screen. The icon (`public/app-icon.svg`, drawn at 1024 units;
`favicon.svg` is the same in a circle, also used by the loader, Splash and the sign-in screen; all three icon SVGs are
written by `node scripts/app-icon.mjs`, so edit that, then `npm run icons`) is an abstract bench press that reads as
Rerack: a barbell through the middle with an r on the left (its arm at the top) and the same r turned half a turn on
the right (its foot at the bottom), with a thin gap where the bar crosses them (an L and a T before the rename;
`LogoMark` in `RestTimerWidget.swift` draws the same outline). Each piece is a single outline (overlapping shapes
showed as seams under the translucent colour). Since 2026-11-17 the mark is **solid white**, flat (no colour, edges or
glow), on the near-black gradient tile (`#151516` → `#050505`): `STYLE = 'flat'` in the script. Its strokes were then
made bolder, like Hevy's and Threads' (draft B of three: strokes 100 units, was 80; bar 56; drawn 1.1× so it fills
more of the tile; `GEOM` and `MARK_SCALE`). `node scripts/app-icon.mjs drafts` writes variants from its `DRAFTS` to
`drafts/icon/` without touching the real files. The earlier look
(`STYLE = 'glass'`, still drawn by `icon()`): after the Apple TV mark, white at each piece's top left with the logo's
rainbow coming in along its diagonal, glass edges (rim, specular highlight, inner shadow) and a glow; its SVGs, PNGs,
iPhone icon set, portfolio images and script are kept in `archive/icon-rainbow-glass/` (README there says how to bring
it back). The widget and Live Activity still draw `LogoMark` in the theme's sweep.
The iPhone icon set has this dark icon plus a grey one for tinted home screens; `npm run icons` also writes the watch
app's (`RerackWatch/Assets.xcassets`, watchOS rounds it itself). `public/app-icon-light.svg` is a white
version (white tile, near-black lettering; in the glass style a deeper rainbow that rises sooner), used
only for the portfolio: as the iPhone's default it showed on every Default home screen even in dark mode (iOS has no
light-only icon slot, and its Dark style is a home-screen setting, not dark mode), so dark stayed the default. `node scripts/portfolio-logo.mjs` redraws
`portfolio/rerack-logo{,-light}-1080p.png` from both. Rendered to PNG by sharp (librsvg), so
inline the shapes rather than relying on `<use>`. No simulator runtime is installed on this Mac, so compile-check (after `npm run build && npx cap sync ios`)
and leave real testing to the user's phone:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO -quiet
```

(No `-sdk iphonesimulator`: it forces the iOS SDK onto the embedded watch app too, which then fails on its icon.)

**Apple Watch app** (`ios/App/RerackWatch`, SwiftUI, watchOS 10+, bundle `….watchkitapp`, a single-target watch
app embedded in the iPhone app's `Watch` folder; added by `scripts/ios-setup-project.rb`, so list new watch Swift files
in its `WATCH_FILES`). A whole live workout from the watch: start one (the followed routine's Up next, then every
workout), log each set (weight and reps prefilled from the set's placeholders, tap one and turn the Crown: one rep, or
`Settings.weightStep[unit]` (Settings' "Apple Watch weight step" card, app only, any amount; default 5 lb / 2.5 kg,
`weightStepFor`, sent as `WatchState.weightStep`); watchOS doesn't snap the Crown's value, so `SetView` counts whole
steps from where the set opened, the first one to the next multiple: 117 → 120), check it off (the ✓ is gray until
checked, then the sweep; tapping it on a checked set unchecks it and stops the rest it started; a checked set's
changed numbers save a second after the Crown rests; the numbers shown follow the set's values or placeholder
when they change elsewhere, e.g. typed on the phone, `SetView.sourceKey`), Per side for barbell lifts (`WatchExercise.bar`; toggled in
an exercise's set list, a `perSide` op; the weight box then shows and turns one side, "135 lb total" small under it, and above the
heaviest plate, unless "Show as plates" is off (watch-only `@AppStorage`), as its plates, the same plate counted with a small "×n" (`plateGroups`): 70 → "45+25", 115 → "45×2+25", 425 → "45×4+10"; more than three kinds of plate show the number), ‹ › between sets or pick any from the exercises page (and add a set), rest with ±15 s
and stop, finish or cancel. Three vertical pages: the set (or the rest while it runs; "Next: …" under the countdown
peeks at the set), the exercises, the workout (time, heart rate, Start rest, Finish, Cancel workout).
- **Watch-first, queued** (chosen so it works with the phone locked in a pocket, the app killed, or no phone nearby):
  the web view doesn't run then (a background wake starts only native code: no scene, no JS), so the watch logs on
  its own copy. The phone sends a `WatchState` (`src/core/watch.ts` `watchState`: the open live session without
  `resumedFrom`, last time's sets per entry, each exercise's name / rest (`restSecondsFor` with compound/isolation) /
  bodyweight / picture, the rest default, and every workout as `createSessionFromWorkout` would make it, with last
  time's sets per slot) as the WatchConnectivity application context. Each change on the watch is a `WatchOp` (`start`
  with the whole session built on the watch, `set` (a set as it is now, added if new), `rest`, `finish`, `cancel`,
  `presence`), values not changes, so replaying one twice is harmless. The watch applies it at once, keeps it in
  `pending` and shows the state with pending ops replayed over it (`WatchStore.replay`, mirroring `applyWatchOp`).
  Ops go by `transferUserInfo` (FIFO, delivered even to a killed app) plus a `sendMessage` ping when reachable, which
  wakes the phone app in the background.
- Phone, native (`WatchBridge.swift`, activated in `AppDelegate` so a background launch has it): keeps ops in
  UserDefaults in order until JS acknowledges them, ignores repeats by `src` (one id per watch install) + `seq`, and
  updates the lock screen itself from each op's `display` (`RestActivityPlugin.updateRunning`: only an activity
  already showing; one can't be started from the background), cancelling the phone's "Rest over" (id 1) on rest ops,
  ending it on finish/cancel. `WatchPlugin.swift` (`Watch` in JS). JS (`src/native/watch.ts` `useAppleWatch`, in
  Layout): once the sessions have loaded, applies ops through `repo` (`applyWatchOp`: set ops reorder with
  `orderByProgress`, finish is `finalizeSession` at the watch's time), acks each, then sends a fresh state read
  straight from the repo. The context carries `applied` (the last op applied), and the watch drops its pending ops up
  to it; an ack never sends the old state (that would undo them on the watch until the next). So the cloud and the
  phone's screens catch up when the phone app next runs (opening it does it).
- **Timers on the watch are `TimelineView`s** ticking each second with the text formatted by hand: a timer `Text`
  (`timerInterval:` / `style: .timer`) shows "1:--" when the watch dims (wrist turned), and the workout session lets
  a timeline keep 1 Hz then. The Smart Stack's Live Activity (`WatchActivityView`) can't do that: dimmed
  (`isLuminanceReduced`) it shows "until 5:12 PM" and drops the workout's time.
- **Rest**: same rules on the watch (`WatchStore.check`: none after a warm-up, an exercise's last set, or inside a
  superset; per-exercise and compound/isolation lengths from the state; `restHidden` blocks auto rests; Start uses
  `restLength` else the default). While its workout session runs the watch schedules its own "Rest over"
  notification and taps the wrist when it ends: its `willPresent` plays `.notification` and holds the banner back (returning
nothing there was silent, wrist down counts as in front); with no notification scheduled the rest screen taps it, and tells the
  phone (`presence`): `useAppleWatch` returns that session id and Layout stops the phone's rest notification for it,
  so it doesn't buzz twice.
- **Workout session and Health** (`WorkoutManager.swift`): an `HKWorkoutSession` (strength training, backdated to the
  session's start) runs while a workout is open on the watch: keeps the app in front, heart rate on the workout page,
  recovered after a relaunch. Finishing on the watch saves it to Health with heart rate and energy, tagged with the
  session id (`HKMetadataKeyExternalUUID`), and the finish op says so: the session gets `savedByWatch`, and the
  phone's `saveToAppleHealth` / `syncToAppleHealth` / `healthWorkouts` skip it. Finished or cancelled on the phone,
  the watch discards its workout and the phone saves its own as before. Deleting removes copies from both sources
  (`AppHealthPlugin.removeCopies` matches any source whose bundle id starts with the app's).
- **Starting on the phone opens the watch** (like Hevy): `useAppleWatch` calls `Watch.startWatchApp` (WatchPlugin →
  `HKHealthStore.startWatchApp` with a strength-training configuration) once for a live workout started in the last
  2 min (remembered in localStorage `rerack:watch-launched`; not for ones started on the watch, `startedOnWatch`),
  after sending its state. watchOS launches the watch app (`WatchAppDelegate.handle(_ workoutConfiguration:)` →
  `WatchStore.launchedForWorkout`): a `.start` tap, and the workout session starts at once with no app session yet
  (`WorkoutManager.isUnassigned`), which brings the app to the front; when the workout arrives in the state,
  `adopt` tags it with the session id and name. Dropped after 2 min if it never comes.
- **The iPhone's Live Activity on the watch**: `supplementalActivityFamilies([.small])` with its own layout
  (`WatchActivityView` in `RestTimerWidget.swift`: the countdown and bar while resting, else exercise, set and time),
  so it appears in the watch's Smart Stack by itself; the watch app's `WKSupportsLiveActivityLaunchAttributeTypes`
  (`RestActivityAttributes`) makes tapping it open Rerack there. That API needs iOS 18, so the widget extension's
  deployment target is 18, and so is the app's (`DEPLOYMENT` in the setup script). Only exists when the phone started the activity (it can't be started from the background), so a
  workout started on the watch with the phone asleep has none until the phone app opens.
- Watch buttons are drawn by hand (`RoundButton`, the sweep capsule for ✓): toolbar `.bottomBar` items came out as
  blank tinted circles on watchOS 27.
- Running on the watch from Xcode needs it paired in **Device Hub** (Xcode 27's devices window, ⇧⌘2): watchOS 27
  watches pair by hand ("user-driven network pairing"), not through the iPhone. If it never shows up, `sudo pkill -9
  remotepairingd` and keep the watch unlocked on the same Wi-Fi; Developer Mode appears on the watch after pairing.
  "Could not get trait set for device Watch7,9" from the asset catalog is Xcode not knowing the Series 10: harmless.
- Not handled: starting on the watch while the phone has a different workout open that the watch hasn't heard of
  (both stay open); the watch keeps the last account's state after signing out; no exercise pictures on the watch.
  Compile-checked only (watchOS SDK; no watch simulator runtime).

**Judging animation from screen recordings.** The user sends iPhone screen recordings (often alongside Apple's Health
app as the reference). iOS writes a frame only when the screen changes, so gaps between frame timestamps longer than
~17 ms are freezes. Measure per-frame sideways motion of a horizontal band (ffmpeg crop + scale to one row, then find
the best shift between frames) for the page and, separately, the tab bar; that found the swipe stutters that frames
alone didn't show.
