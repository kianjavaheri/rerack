import { App } from '@capacitor/app';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '../core/types';
import { isNative } from './platform';

/**
 * In the iPhone app, follows `rerack://` links: the home-screen widget opens rerack://check-in, which goes to Check in
 * (where its "up next" workout is started), or straight to the workout under way if one is open. Covers both a launch
 * from the link and the app already running; a link waits until the workouts have loaded, to know if one is open.
 */
export function useAppLinks(sessions: Session[] | undefined) {
  const navigate = useNavigate();
  // A new object per link, so the same link opened twice is followed twice.
  const [pending, setPending] = useState<{ url: string } | null>(null);
  const followed = useRef<{ url: string } | null>(null);

  useEffect(() => {
    if (!isNative) return;
    void App.getLaunchUrl()
      .then((launch) => launch?.url && setPending({ url: launch.url }))
      .catch(() => {});
    const listener = App.addListener('appUrlOpen', (e) => setPending({ url: e.url }));
    return () => {
      void listener.then((l) => l.remove());
    };
  }, []);

  useEffect(() => {
    if (!pending || !sessions || followed.current === pending) return;
    followed.current = pending;
    const target = pending.url.replace(/^rerack:\/\//, '').replace(/^\/+|\/+$/g, '');
    if (target === 'check-in') {
      const open = sessions.find((s) => !s.finishedAt);
      navigate(open ? `/session/${open.id}` : '/check-in');
    }
  }, [pending, sessions, navigate]);
}
