import { accentOf, DEFAULT_ACCENT } from './accents';
import type { PlusStatus, Settings } from './types';

/**
 * Rerack Plus: an upgrade, never a gate. Everything you need to train (logging, routines, progress, sync, the watch,
 * widgets, Health, backups) stays free with no limits and no trial. Plus adds how the app looks: every accent but
 * Classic, the colour wheel, the Bamboo theme and the matching app icon.
 *
 * Sold in the iPhone app through StoreKit (`native/purchases.ts`); App Store Connect has these products, a monthly
 * and a yearly subscription in one group ("Rerack Plus") and a one-time lifetime purchase.
 */
export const PLUS_PRODUCTS = {
  monthly: 'com.kianjavaheri.fitnesstracker.plus.monthly',
  yearly: 'com.kianjavaheri.fitnesstracker.plus.yearly',
  lifetime: 'com.kianjavaheri.fitnesstracker.plus.lifetime',
} as const;
export const PLUS_PRODUCT_IDS: string[] = Object.values(PLUS_PRODUCTS);

/** What Plus adds, in the order the Plus sheet lists them. */
export const PLUS_FEATURES = [
  { title: 'Every accent colour', text: 'Purple, Pink, Ocean, Forest, Gold and Mono, on the app, lock screen, widget and watch.' },
  { title: 'Your own colour', text: 'Pick any colour on the wheel and the app builds its sweep from it.' },
  { title: 'Bamboo theme', text: 'A warm off-white page, easy on the eyes.' },
  { title: 'Matching app icon', text: 'The home-screen icon in your accent and theme.' },
] as const;

/** Free for everyone: Classic. Every other accent (premade or custom) is Plus. */
export const isPlusAccent = (accent: string) => accent !== DEFAULT_ACCENT;
export const isPlusTheme = (theme: Settings['theme']) => theme === 'bamboo';

/**
 * How long a synced subscription is still trusted past its expiry. Renewals are only seen by the iPhone app (StoreKit),
 * so on the web or another device a renewed subscription would otherwise lapse until the phone app next opens.
 */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** The synced copy (`Settings.plus`) says Plus is on: a lifetime purchase, or a subscription not long expired. */
export function plusActive(status: PlusStatus | null | undefined, now = Date.now()): boolean {
  if (!status) return false;
  if (status.expiresAt == null) return true;
  return Date.parse(status.expiresAt) + GRACE_MS > now;
}

/**
 * The settings the app actually uses without Plus: Classic, Light instead of Bamboo, the usual icon. The saved choice
 * is left alone, so it comes back with Plus.
 */
export function withoutPlus(settings: Settings): Settings {
  const accent = accentOf(settings);
  if (!isPlusAccent(accent) && !isPlusTheme(settings.theme) && !settings.appIconMatches) return settings;
  return {
    ...settings,
    accent: isPlusAccent(accent) ? DEFAULT_ACCENT : accent,
    theme: isPlusTheme(settings.theme) ? 'light' : settings.theme,
    appIconMatches: false,
  };
}

/** One of StoreKit's verified transactions that grants Plus now (`Transaction.currentEntitlements`). */
export interface PlusEntitlement {
  productId: string;
  /** The subscription's (or purchase's) first transaction: stays the same across renewals. */
  originalId: string;
  purchasedAt: string;
  /** Null for the lifetime purchase. */
  expiresAt: string | null;
  /** Subscriptions: renews at `expiresAt` (false once cancelled in the App Store). */
  willRenew?: boolean;
}

/** What StoreKit knows on this iPhone, under the Apple ID signed in to the App Store. */
export interface StoreState {
  /** Purchases granting Plus now. */
  active: PlusEntitlement[];
  /** Every purchase this Apple ID ever made here (original ids), expired and refunded ones included. */
  known: string[];
}

/** The strongest entitlement: lifetime first, else the subscription running longest. */
export function bestEntitlement(active: PlusEntitlement[]): PlusEntitlement | null {
  const plus = active.filter((e) => PLUS_PRODUCT_IDS.includes(e.productId));
  return (
    plus.find((e) => e.expiresAt == null) ??
    plus.sort((a, b) => Date.parse(b.expiresAt ?? '') - Date.parse(a.expiresAt ?? ''))[0] ??
    null
  );
}

/**
 * What the synced copy should become after asking StoreKit, or undefined to leave it. StoreKit granting Plus always
 * wins. It not granting Plus only clears the copy when the copy is one of this Apple ID's own purchases (expired,
 * cancelled or refunded): another device's purchase under a different Apple ID is none of this phone's business.
 */
export function syncedPlus(saved: PlusStatus | null | undefined, store: StoreState): PlusStatus | null | undefined {
  const best = bestEntitlement(store.active);
  if (best) {
    const next: PlusStatus = { productId: best.productId, originalId: best.originalId, expiresAt: best.expiresAt };
    if (best.willRenew != null) next.willRenew = best.willRenew;
    const same =
      saved &&
      saved.productId === next.productId &&
      saved.originalId === next.originalId &&
      saved.expiresAt === next.expiresAt &&
      saved.willRenew === next.willRenew;
    return same ? undefined : next;
  }
  if (saved && store.known.includes(saved.originalId)) return null;
  return undefined;
}

/** "Lifetime", "Yearly · renews Dec 27", "Monthly · ends Jan 3". */
export function plusSummary(status: PlusStatus): string {
  const plan =
    status.productId === PLUS_PRODUCTS.lifetime ? 'Lifetime' : status.productId === PLUS_PRODUCTS.yearly ? 'Yearly' : 'Monthly';
  if (status.expiresAt == null) return plan;
  const date = new Date(status.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${plan} · ${status.willRenew === false ? 'ends' : 'renews'} ${date}`;
}
