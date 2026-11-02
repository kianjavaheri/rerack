import { useAuth, type AccountUser } from '../auth/AuthProvider';
import { useSettings } from './settings';

/** The signed-in account as shown in the app: your profile's name and photo over the sign-in's (Settings → Profile). */
export function useAccountUser(): AccountUser | null {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (!user) return null;
  const profile = settings.profile;
  return { ...user, name: profile?.name?.trim() || user.name, photoURL: profile?.photo || user.photoURL };
}

/** First name for greetings: the profile's, else the account's (none in local-only mode without a profile name). */
export function useFirstName(): string | undefined {
  const { user } = useAuth();
  const { settings } = useSettings();
  return (settings.profile?.name?.trim() || user?.name?.trim())?.split(/\s+/)[0] || undefined;
}
