
 // Cache de la orden de Apple Pay / Google Pay por carrito+total.


import { computeFingerprint, FingerprintInput } from "./paymentIdempotency";

type WalletProvider = "apple" | "google";

interface StoredWalletOrder {
  fingerprint: string;
  orderId: string;
  amount: number;
  createdAt: number;
}

function storageKey(provider: WalletProvider): string {
  return provider === "apple" ? "even-applepay-order" : "even-googlepay-order";
}

function readStoredOrder(provider: WalletProvider): StoredWalletOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(provider));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fingerprint || !parsed?.orderId) return null;
    return parsed as StoredWalletOrder;
  } catch {
    return null;
  }
}

function saveStoredOrder(provider: WalletProvider, order: StoredWalletOrder): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(provider), JSON.stringify(order));
  } catch {
    // sessionStorage puede fallar (modo privado, cuota) — el peor caso es
    // volver a crear la orden, igual que antes de este fix.
  }
}

/** Se borra al confirmar el pago — una orden ya cobrada no debe reutilizarse. */
export function clearCachedWalletOrder(provider: WalletProvider): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(provider));
  } catch {
    // no-op
  }
}

/**
 * Devuelve el orderId cacheado si el carrito no cambió desde la última vez;
 * si cambió (o no había), llama a `create` y cachea lo que devuelva.
 */
export async function getOrCreateWalletOrderId(
  provider: WalletProvider,
  fingerprintInput: FingerprintInput,
  create: () => Promise<string | null>,
): Promise<string | null> {
  const fingerprint = await computeFingerprint(fingerprintInput);
  const stored = readStoredOrder(provider);
  if (stored && stored.fingerprint === fingerprint) {
    return stored.orderId;
  }

  const orderId = await create();
  if (orderId) {
    saveStoredOrder(provider, {
      fingerprint,
      orderId,
      amount: fingerprintInput.total,
      createdAt: Date.now(),
    });
  }
  return orderId;
}
