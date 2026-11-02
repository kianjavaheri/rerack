export const APP_NAME = 'Rerack';

/**
 * The app's Home. `/` is the website's landing page (index.html shows it to new visitors on the web), so in the app `/`
 * only redirects here.
 */
export const HOME_PATH = '/home';

/** Set once this browser has used the app: index.html then skips the landing page at `/` (read there by name). */
export const APP_USER_KEY = 'rerack:app-user';

/** Workouts page on its Plan view (routines, workouts, exercises, import): where editors return to. */
export const PLAN_PATH = '/workouts';

/** Rep range given to an exercise when it's added to a workout. */
export const DEFAULT_REPS = '6-12';

/** Sets given to an exercise when it's added to a workout or a session. */
export const DEFAULT_SETS = 2;
