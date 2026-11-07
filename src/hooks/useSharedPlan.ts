import { useEffect, useState } from 'react';
import { loadShortShare } from '../auth/shareLinks';
import { decodeShare, type SharePayload } from '../core/share';

/** A short link's id from its path (/s/<id>), if it is one. */
export const shortShareId = (pathname: string) => /^\/s\/([A-Za-z0-9]{6,16})\/?$/.exec(pathname)?.[1];

/**
 * The plan a share link holds: from the link itself (/share#…), or loaded by its id (/s/<id>, Firestore).
 * undefined while loading, null when the link is damaged, wrong or deleted. Takes the path and hash as arguments, so
 * the sign-in screen (above the router) can use it with window.location.
 */
export function useSharedPlan(pathname: string, hash: string): SharePayload | null | undefined {
  const id = shortShareId(pathname);
  const [loaded, setLoaded] = useState<{ id: string; payload: SharePayload | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void loadShortShare(id).then((payload) => live && setLoaded({ id, payload }));
    return () => {
      live = false;
    };
  }, [id]);
  if (id) return loaded?.id === id ? loaded.payload : undefined;
  return pathname === '/share' ? decodeShare(hash.slice(1)) : null;
}
