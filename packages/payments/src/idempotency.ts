/**
 * Idempotencia de cobro en el checkout de tarjeta guardada.
 *
 * Regla de oro: después de un 2xx de /payments, la app NUNCA vuelve a llamar
 * /payments con otra clave para el mismo carrito. La clave (`intentKey`) y el
 * `fingerprint` del carrito se generan una sola vez por intento de compra y
 * viven en sessionStorage — sobreviven a "Intentar de nuevo" y solo se
 * regeneran cuando el carrito cambia de verdad (líneas, propina, descuento,
 * total), nunca por tiempo ni por recargar la página.
 */

export const PAYMENT_INTENT_STORAGE_KEY = "even-payment-intent";

export interface StoredPaymentIntent {
  intentKey: string;
  fingerprint: string;
  amount: number;
  // Se llena en cuanto /payments confirma el cobro — a partir de ahí ningún
  // reintento debe volver a llamar /payments, solo /confirm con este id.
  ecartpayOrderId: string | null;
  createdAt: number;
}

export interface FingerprintItemInput {
  menuItemId?: string | number | null;
  quantity: number;
  extraPrice?: number;
  customFields?: unknown;
}

export interface FingerprintInput {
  items: FingerprintItemInput[];
  tipAmount: number;
  discountId?: string | null;
  total: number;
}

/** UUID sin guiones; cumple el formato que valida el backend (16-64 chars). */
export function generateIntentKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    // sigue al fallback
  }
  // Fallback para iOS < 15.4 / navegadores in-app sin crypto.randomUUID.
  const parte = () => Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${parte()}${parte()}`.slice(0, 40);
}

async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // sigue al fallback
  }
  // FNV-1a de 32 bits — no criptográfico, solo necesita ser estable y
  // detectar cambios de carrito, no resistir un ataque.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** Hash estable del carrito — mismo fingerprint para el mismo pedido. */
export async function computeFingerprint(
  input: FingerprintInput,
): Promise<string> {
  const canonicalItems = [...input.items]
    .map((item) => ({
      id: item.menuItemId ?? null,
      qty: item.quantity,
      extra: item.extraPrice || 0,
      cf: item.customFields ?? null,
    }))
    .sort((a, b) => {
      const idCompare = String(a.id).localeCompare(String(b.id));
      if (idCompare !== 0) return idCompare;
      return JSON.stringify(a.cf).localeCompare(JSON.stringify(b.cf));
    });

  const canonical = JSON.stringify({
    items: canonicalItems,
    tip: Math.round(input.tipAmount * 100),
    discount: input.discountId ?? null,
    total: Math.round(input.total * 100),
  });

  return sha256Hex(canonical);
}

/** Subconjunto de `Storage` que usa el store; facilita tests sin DOM. */
export type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface PaymentIntentStore {
  get(): StoredPaymentIntent | null;
  save(intent: StoredPaymentIntent): void;
  update(patch: Partial<StoredPaymentIntent>): void;
  /** Solo se borra cuando la orden queda confirmada (o el intento se descarta). */
  clear(): void;
  /**
   * Reclama (o reutiliza) el intent para el carrito actual. Si el fingerprint
   * coincide con el que ya había, reutiliza la misma clave — es la regla de
   * oro. Si cambió, genera una clave nueva (el carrito es, para efectos de
   * idempotencia, un pedido distinto).
   */
  ensure(input: FingerprintInput): Promise<StoredPaymentIntent>;
}

function browserSessionStorage(): IntentStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createPaymentIntentStore(options?: {
  storage?: () => IntentStorage | null;
  key?: string;
  now?: () => number;
}): PaymentIntentStore {
  const getStorage = options?.storage ?? browserSessionStorage;
  const key = options?.key ?? PAYMENT_INTENT_STORAGE_KEY;
  const now = options?.now ?? Date.now;

  const store: PaymentIntentStore = {
    get() {
      const storage = getStorage();
      if (!storage) return null;
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.intentKey || !parsed?.fingerprint) return null;
        return parsed as StoredPaymentIntent;
      } catch {
        return null;
      }
    },

    save(intent) {
      const storage = getStorage();
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(intent));
      } catch {
        // sessionStorage puede fallar (modo privado, cuota) — no es fatal, el
        // peor caso es perder la protección de idempotencia en ESE dispositivo.
      }
    },

    update(patch) {
      const current = store.get();
      if (!current) return;
      store.save({ ...current, ...patch });
    },

    clear() {
      const storage = getStorage();
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // no-op
      }
    },

    async ensure(input) {
      const fingerprint = await computeFingerprint(input);
      const stored = store.get();

      if (stored && stored.fingerprint === fingerprint) {
        return stored;
      }

      const fresh: StoredPaymentIntent = {
        intentKey: generateIntentKey(),
        fingerprint,
        amount: input.total,
        ecartpayOrderId: null,
        createdAt: now(),
      };
      store.save(fresh);
      return fresh;
    },
  };

  return store;
}

/** Store por defecto sobre sessionStorage del navegador. */
export const paymentIntentStore = createPaymentIntentStore();
