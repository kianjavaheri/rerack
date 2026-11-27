import { Check } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PLUS_FEATURES, PLUS_PRODUCTS, plusSummary } from '../core/plus';
import { useSettings } from '../hooks/settings';
import { isNative, SITE_URL } from '../native/platform';
import { canPurchase, loadProducts, manageSubscription, purchase, restorePurchases, type StoreProduct } from '../native/purchases';
import { haptic } from '../utils/haptics';
import { useFeedback } from './Feedback';
import { Modal } from './Modal';

// Open from anywhere (Settings' Plus card, a locked accent's preview, the app icon switch); drawn once, in Layout.
let open = false;
const listeners = new Set<() => void>();
const setOpen = (next: boolean) => {
  open = next;
  listeners.forEach((l) => l());
};
export const openPlusSheet = () => setOpen(true);

export function PlusSheetHost() {
  const isOpen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
  return isOpen ? <PlusSheet onClose={() => setOpen(false)} /> : null;
}

/** Apple's standard licence agreement, which the App Store uses unless an app has its own. */
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const ORDER = [PLUS_PRODUCTS.yearly, PLUS_PRODUCTS.monthly, PLUS_PRODUCTS.lifetime];

const planName = (p: StoreProduct) => (p.type === 'lifetime' ? 'Lifetime' : p.period === 'year' ? 'Yearly' : 'Monthly');
const priceLine = (p: StoreProduct) =>
  p.type === 'lifetime' ? `${p.price} once` : `${p.price} a ${p.periodValue && p.periodValue > 1 ? `${p.periodValue} ${p.period}s` : p.period}`;

/**
 * What Plus is and how to get it. Calm on purpose: no trial, no countdown, no "best value" badge. Everything needed to
 * train is free; this says so first. In the iPhone app it sells the three products (StoreKit); on the web, where Apple's
 * purchases can't be made, it says where to get it.
 */
function PlusSheet({ onClose }: { onClose: () => void }) {
  const { plus, settings } = useSettings();
  const { notify } = useFeedback();
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [chosen, setChosen] = useState<string>(PLUS_PRODUCTS.yearly);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [pending, setPending] = useState(false);

  const load = () => {
    setLoadError(false);
    loadProducts()
      .then((list) => setProducts(ORDER.map((id) => list.find((p) => p.id === id)).filter((p): p is StoreProduct => !!p)))
      .catch(() => setLoadError(true));
  };
  useEffect(() => {
    if (canPurchase) load();
  }, []);

  const product = products?.find((p) => p.id === chosen) ?? products?.[0];

  const buy = async () => {
    if (!product) return;
    setBusy('buy');
    try {
      const result = await purchase(product.id);
      if (result.status === 'purchased') {
        haptic();
        notify('Thanks for getting Plus');
        onClose();
      } else if (result.status === 'pending') {
        setPending(true);
      }
    } catch (err) {
      notify(err instanceof Error && err.message ? err.message : 'The purchase didn’t go through');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const state = await restorePurchases();
      notify(state.active.length ? 'Plus restored' : 'No Plus purchase found for this Apple ID');
      if (state.active.length) onClose();
    } catch (err) {
      notify(err instanceof Error && err.message ? err.message : 'Couldn’t reach the App Store');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Rerack Plus" onClose={onClose}>
      <p className="muted plus-lead">
        Everything you need to train is free, with no limits. Plus makes the app look the way you like, and helps keep
        it going.
      </p>
      <ul className="plus-features">
        {PLUS_FEATURES.map((f) => (
          <li key={f.title}>
            <span className="plus-check">
              <Check size={14} strokeWidth={3} />
            </span>
            <span>
              <strong>{f.title}</strong>
              <span className="muted small">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>

      {plus ? (
        <div className="plus-have">
          <div style={{ fontWeight: 600 }}>You have Plus</div>
          {settings.plus && <div className="muted small">{plusSummary(settings.plus)}</div>}
          {isNative && settings.plus?.expiresAt != null && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => void manageSubscription().catch(() => {})}>
              Manage subscription
            </button>
          )}
        </div>
      ) : !canPurchase ? (
        <div className="plus-have">
          <div style={{ fontWeight: 600 }}>Get it in the iPhone app</div>
          <div className="muted small">
            Plus is bought in the Rerack app on iPhone. Signed in with the same account, it’s on here too.
          </div>
        </div>
      ) : (
        <>
          <div className="plus-plans" role="radiogroup" aria-label="Plan">
            {loadError ? (
              <div className="muted small" style={{ textAlign: 'center' }}>
                Couldn’t reach the App Store.{' '}
                <button type="button" className="link-btn" onClick={load}>
                  Try again
                </button>
              </div>
            ) : !products ? (
              <div className="muted small" style={{ textAlign: 'center', padding: 18 }}>
                Loading prices…
              </div>
            ) : products.length === 0 ? (
              <div className="muted small" style={{ textAlign: 'center' }}>
                Plus isn’t available right now.
              </div>
            ) : (
              products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={product?.id === p.id}
                  className={`plus-plan${product?.id === p.id ? ' on' : ''}`}
                  onClick={() => setChosen(p.id)}
                >
                  <span className="plus-radio" />
                  <span className="plus-plan-name">{planName(p)}</span>
                  <span className="plus-plan-price">{priceLine(p)}</span>
                </button>
              ))
            )}
          </div>
          {pending && (
            <div className="muted small" style={{ marginTop: 10, textAlign: 'center' }}>
              Waiting for approval. Plus turns on by itself once it’s approved.
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary plus-buy"
            disabled={!product || busy != null}
            onClick={() => void buy()}
          >
            {busy === 'buy' ? 'Opening the App Store…' : product ? `Continue with ${planName(product)}` : 'Continue'}
          </button>
          <p className="muted plus-fine">
            {product?.type === 'lifetime'
              ? 'One payment, yours for good.'
              : 'Renews automatically until you cancel, which you can do any time in your Apple ID’s subscriptions, at least a day before it renews.'}{' '}
            Family Sharing included.
          </p>
          <div className="plus-links">
            <button type="button" className="link-btn" disabled={busy != null} onClick={() => void restore()}>
              {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
            </button>
            <a href={TERMS_URL} target="_blank" rel="noopener">
              Terms of Use
            </a>
            <a href={`${SITE_URL}/privacy`} target="_blank" rel="noopener">
              Privacy
            </a>
          </div>
        </>
      )}
    </Modal>
  );
}
