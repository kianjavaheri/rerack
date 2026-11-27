import { registerPlugin } from '@capacitor/core';
import { useEffect, useSyncExternalStore } from 'react';
import { PLUS_PRODUCT_IDS, syncedPlus, type PlusEntitlement, type StoreState } from '../core/plus';
import type { Settings } from '../core/types';
import { isNative } from './platform';

/** A product as the App Store sells it here, priced in the buyer's own currency. */
export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  /** Formatted for the buyer: "$19.99", "19,99 €". */
  price: string;
  priceValue: number;
  type: 'subscription' | 'lifetime' | 'other';
  /** Subscriptions: "month" or "year" (with `periodValue`, e.g. 1). */
  period?: 'day' | 'week' | 'month' | 'year';
  periodValue?: number;
}

export type PurchaseResult = { status: 'purchased'; store: StoreState } | { status: 'cancelled' | 'pending' };

/** ios/App/App/AppPurchasesPlugin.swift (StoreKit 2). */
interface AppPurchasesPlugin {
  products(options: { ids: string[] }): Promise<{ products: StoreProduct[] }>;
  purchase(options: { id: string }): Promise<{ status: 'purchased' | 'cancelled' | 'pending'; active?: PlusEntitlement[]; known?: string[] }>;
  entitlements(): Promise<StoreState>;
  restore(): Promise<StoreState>;
  manage(): Promise<void>;
  addListener(event: 'changed', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}
const AppPurchases = registerPlugin<AppPurchasesPlugin>('AppPurchases');

/** Purchases can be made here: the iPhone app. The web shows what Plus is and how to get it. */
export const canPurchase = isNative;

// ---- What StoreKit says, shared by everything that asks (SettingsProvider, the Plus sheet, Settings' card) ----

let store: StoreState | null = null;
const listeners = new Set<() => void>();
function setStore(next: StoreState) {
  store = next;
  for (const fn of listeners) fn();
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * For trying Plus in development (Settings' Plus card has the switch): never in a build, so it can't unlock anything
 * for real.
 */
const DEV_KEY = 'rerack:plus-dev';
let devPlus = (() => {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
})();
export function setDevPlus(on: boolean) {
  if (!import.meta.env.DEV) return;
  devPlus = on;
  try {
    if (on) localStorage.setItem(DEV_KEY, '1');
    else localStorage.removeItem(DEV_KEY);
  } catch {
    // Private mode: lasts until reload.
  }
  for (const fn of listeners) fn();
}

/** StoreKit's state on this iPhone (null until asked, and always on the web). */
export function useStoreState(): StoreState | null {
  return useSyncExternalStore(subscribe, () => store);
}

/** Plus from StoreKit on this iPhone (or the development switch), whatever the synced copy says. */
export function useDevicePlus(): boolean {
  return useSyncExternalStore(subscribe, () => devPlus || !!store?.active.some((e) => PLUS_PRODUCT_IDS.includes(e.productId)));
}
export const useDevPlus = () => useSyncExternalStore(subscribe, () => devPlus);

export async function refreshStore(): Promise<StoreState | null> {
  if (!isNative) return null;
  const next = await AppPurchases.entitlements();
  setStore(next);
  return next;
}

let productsPromise: Promise<StoreProduct[]> | null = null;
/** The Plus products with their prices, asked once (again after a failure, e.g. offline). */
export function loadProducts(): Promise<StoreProduct[]> {
  if (!isNative) return Promise.resolve([]);
  productsPromise ??= AppPurchases.products({ ids: PLUS_PRODUCT_IDS })
    .then((r) => r.products)
    .catch((err) => {
      productsPromise = null;
      throw err;
    });
  return productsPromise;
}

export async function purchase(id: string): Promise<PurchaseResult> {
  const result = await AppPurchases.purchase({ id });
  if (result.status !== 'purchased') return { status: result.status };
  const next = { active: result.active ?? [], known: result.known ?? [] };
  setStore(next);
  return { status: 'purchased', store: next };
}

/** Restore purchases: asks the App Store to sync (it may ask for the Apple ID password), then reads them again. */
export async function restorePurchases(): Promise<StoreState> {
  const next = await AppPurchases.restore();
  setStore(next);
  return next;
}

/** Apple's own sheet for changing or cancelling the subscription. */
export const manageSubscription = () => AppPurchases.manage();

/**
 * Keeps `Settings.plus` matching StoreKit (Layout, once settings have loaded): read at start, when the app comes back
 * to the front, and whenever StoreKit reports a change (a renewal, a refund, Ask to Buy approved, a purchase made on
 * another device with the same Apple ID). Writing it is what lets the web app and other devices know.
 */
export function usePurchases(settings: Settings, ready: boolean, update: (patch: Partial<Settings>) => void) {
  const state = useStoreState();

  useEffect(() => {
    if (!isNative) return;
    const read = () => void refreshStore().catch((err) => console.warn('Purchases:', err));
    read();
    const handle = AppPurchases.addListener('changed', read);
    const onVisible = () => document.visibilityState === 'visible' && read();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      void handle.then((h) => h.remove());
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!ready || !state) return;
    const next = syncedPlus(settings.plus, state);
    if (next !== undefined) update({ plus: next });
  }, [ready, state, settings.plus]); // eslint-disable-line react-hooks/exhaustive-deps
}
