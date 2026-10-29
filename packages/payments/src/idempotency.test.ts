import { describe, expect, it } from "vitest";
import {
  PAYMENT_INTENT_STORAGE_KEY,
  computeFingerprint,
  createPaymentIntentStore,
  generateIntentKey,
  type FingerprintInput,
} from "./idempotency";
import { memoryStorage } from "./test/helpers";

const cart: FingerprintInput = {
  items: [
    { menuItemId: "b", quantity: 1, extraPrice: 10, customFields: { x: 1 } },
    { menuItemId: "a", quantity: 2 },
  ],
  tipAmount: 15.5,
  discountId: null,
  total: 215.5,
};

describe("generateIntentKey", () => {
  it("genera claves de 16-64 caracteres sin guiones y únicas", () => {
    const a = generateIntentKey();
    const b = generateIntentKey();
    expect(a).toMatch(/^[a-z0-9]{16,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("computeFingerprint", () => {
  it("no depende del orden de las líneas", async () => {
    const reversed = { ...cart, items: [...cart.items].reverse() };
    expect(await computeFingerprint(reversed)).toBe(await computeFingerprint(cart));
  });

  it("es un sha256 hex", async () => {
    expect(await computeFingerprint(cart)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["cantidad", { ...cart, items: [{ ...cart.items[0], quantity: 3 }, cart.items[1]] }],
    ["propina", { ...cart, tipAmount: 20 }],
    ["descuento", { ...cart, discountId: "d1" }],
    ["total", { ...cart, total: 216 }],
    ["customFields", { ...cart, items: [{ ...cart.items[0], customFields: { x: 2 } }, cart.items[1]] }],
  ])("cambia si cambia %s", async (_, changed) => {
    expect(await computeFingerprint(changed)).not.toBe(await computeFingerprint(cart));
  });

  it("ignora diferencias de centavos por debajo del redondeo", async () => {
    expect(await computeFingerprint({ ...cart, total: 215.5000001 })).toBe(
      await computeFingerprint(cart),
    );
  });
});

describe("createPaymentIntentStore", () => {
  it("reutiliza la misma clave para el mismo carrito (regla de oro)", async () => {
    const storage = memoryStorage();
    const store = createPaymentIntentStore({ storage: () => storage });

    const first = await store.ensure(cart);
    const second = await store.ensure(cart);

    expect(second.intentKey).toBe(first.intentKey);
    expect(storage.data.has(PAYMENT_INTENT_STORAGE_KEY)).toBe(true);
  });

  it("sobrevive a una recarga (nuevo store sobre el mismo storage)", async () => {
    const storage = memoryStorage();
    const first = await createPaymentIntentStore({ storage: () => storage }).ensure(cart);
    const again = await createPaymentIntentStore({ storage: () => storage }).ensure(cart);
    expect(again.intentKey).toBe(first.intentKey);
  });

  it("genera clave nueva cuando el carrito cambia", async () => {
    const storage = memoryStorage();
    const store = createPaymentIntentStore({ storage: () => storage });
    const first = await store.ensure(cart);
    const changed = await store.ensure({ ...cart, tipAmount: 0 });
    expect(changed.intentKey).not.toBe(first.intentKey);
    expect(changed.ecartpayOrderId).toBeNull();
  });

  it("update conserva la clave y guarda el ecartpayOrderId", async () => {
    const storage = memoryStorage();
    const store = createPaymentIntentStore({ storage: () => storage, now: () => 42 });
    const intent = await store.ensure(cart);

    store.update({ ecartpayOrderId: "ord_1" });

    expect(store.get()).toEqual({ ...intent, ecartpayOrderId: "ord_1", createdAt: 42 });
    expect((await store.ensure(cart)).ecartpayOrderId).toBe("ord_1");
  });

  it("clear borra el intento", async () => {
    const storage = memoryStorage();
    const store = createPaymentIntentStore({ storage: () => storage });
    await store.ensure(cart);
    store.clear();
    expect(store.get()).toBeNull();
  });

  it("ignora datos corruptos en storage", () => {
    const storage = memoryStorage();
    storage.setItem(PAYMENT_INTENT_STORAGE_KEY, "{no json");
    expect(createPaymentIntentStore({ storage: () => storage }).get()).toBeNull();
    storage.setItem(PAYMENT_INTENT_STORAGE_KEY, JSON.stringify({ amount: 1 }));
    expect(createPaymentIntentStore({ storage: () => storage }).get()).toBeNull();
  });

  it("no lanza si el storage falla (modo privado/cuota)", async () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const store = createPaymentIntentStore({ storage: () => broken });
    await expect(store.ensure(cart)).resolves.toMatchObject({ ecartpayOrderId: null });
    expect(() => store.clear()).not.toThrow();
  });

  it("sin storage (SSR) devuelve intent nuevo y no persiste", async () => {
    const store = createPaymentIntentStore({ storage: () => null });
    const a = await store.ensure(cart);
    expect(store.get()).toBeNull();
    expect((await store.ensure(cart)).intentKey).not.toBe(a.intentKey);
  });
});
