import { useFeedback } from '../components/Feedback';
import { saveShortShare } from '../auth/shareLinks';
import { encodeShare, type SharePayload } from '../core/share';
import { isNative, SITE_URL } from '../native/platform';

/** Shares a workout/routine link (short when signed in): the iOS share sheet where available, otherwise copies it. */
export function useShareLink() {
  const { notify } = useFeedback();
  return async (title: string, payload: SharePayload) => {
    // In the iPhone app the page's origin is capacitor://localhost, which nobody else can open.
    const origin = isNative ? SITE_URL : window.location.origin;
    // Signed in: a short link (/s/<id>, the plan saved in Firestore). Otherwise the plan rides in the link itself.
    // Both are made without waiting, so iOS still opens the share sheet from the tap.
    const plan = encodeShare(payload);
    const id = saveShortShare(plan);
    const url = id ? `${origin}/s/${id}` : `${origin}/share#${plan}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title}: add it to your workouts`, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied. Anyone with the app can add it.');
    } catch {
      notify("Couldn't share or copy the link here.");
    }
  };
}
