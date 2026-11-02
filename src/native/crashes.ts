import { isNative } from './platform';

/** Safari's stack lines, "name@file:line:col", as Crashlytics stack frames. */
function frames(stack: string | undefined) {
  return (stack ?? '')
    .split('\n')
    .map((line) => /^(.*)@(.*):(\d+):(\d+)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .slice(0, 30)
    .map(([, functionName, fileName, lineNumber, columnNumber]) => ({
      functionName: functionName || '(anonymous)',
      fileName,
      lineNumber: Number(lineNumber),
      columnNumber: Number(columnNumber),
    }));
}

/**
 * In the iPhone app, sends JavaScript errors nobody caught to Firebase Crashlytics as non-fatal reports (native crashes
 * are caught by Crashlytics itself). Nothing from the user's data goes with them, only the error and where it was. The
 * web has no Crashlytics, so there it does nothing.
 */
export function reportCrashes() {
  if (!isNative) return;
  const seen = new Set<string>();
  const send = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${err.message}\n${err.stack ?? ''}`;
    // The same error repeating (say, every render) is one report.
    if (seen.has(key) || seen.size > 20) return;
    seen.add(key);
    void import('@capacitor-firebase/crashlytics')
      .then(({ FirebaseCrashlytics }) => {
        const stacktrace = frames(err.stack);
        return FirebaseCrashlytics.recordException({ message: `${err.name}: ${err.message}`, ...(stacktrace.length ? { stacktrace } : {}) });
      })
      .catch(() => {});
  };
  window.addEventListener('error', (e) => send(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => send(e.reason));
}
