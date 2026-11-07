import { decodeShare, type SharePayload } from '../core/share';
import { firebaseConfigured } from './config';

// Short share links: www.rerackapp.net/s/<id>, the plan saved in Firestore (`shares/<id>`, see firestore.rules)
// instead of carried in the link. No Firebase SDK here (it stays out of the main bundle): session.ts registers the
// saver once it has loaded, which it has whenever someone is signed in.

type Saver = (id: string, plan: string) => boolean;
let saver: Saver | null = null;

/** Called by session.ts when it loads. */
export function registerShareSaver(save: Saver) {
  saver = save;
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 8 random characters, leaving out ones that are easy to misread (0/O, 1/l/I): ~10^14 possible ids. */
function newShareId(): string {
  const out: string[] = [];
  while (out.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // Only bytes below the largest multiple of the alphabet's length, so every character is equally likely.
      if (byte < 256 - (256 % ID_CHARS.length) && out.length < 8) out.push(ID_CHARS[byte % ID_CHARS.length]);
    }
  }
  return out.join('');
}

/**
 * Saves an encoded plan (`encodeShare`) under a new id and returns it, or null when it can't be (not signed in, or no
 * Firebase): the caller then uses the long link. Doesn't wait for the server: Firestore queues the write (even
 * offline), so the link is ready at once and the share sheet still opens from the tap.
 */
export function saveShortShare(plan: string): string | null {
  if (!saver) return null;
  const id = newShareId();
  return saver(id, plan) ? id : null;
}

/** The plan behind a short link, or null if there's none (a wrong or deleted link) or it can't be reached. */
export async function loadShortShare(id: string): Promise<SharePayload | null> {
  if (!firebaseConfigured || !/^[A-Za-z0-9]{6,16}$/.test(id)) return null;
  try {
    const session = await import('./session');
    const plan = await session.loadSharedPlan(id);
    return plan ? decodeShare(plan) : null;
  } catch {
    return null;
  }
}
