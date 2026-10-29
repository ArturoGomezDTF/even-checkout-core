import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEcartPayCheckout,
  normalizeEcartPayResult,
  waitForEcartPaySDK,
  type EcartPayCheckoutOptions,
} from "./ecartpay";

const options: EcartPayCheckoutOptions = {
  publicID: "pub",
  order: {
    email: "a@b.c",
    first_name: "A",
    last_name: "B",
    currency: "MXN",
    items: [
      { name: "x", price: 10, quantity: 2 },
      { name: "y", price: 5, quantity: 1 },
    ],
  },
};

describe("normalizeEcartPayResult", () => {
  it("devuelve tal cual un resultado con success: true", () => {
    const r = { success: true, payment: { id: "p", status: "ok", amount: 1, currency: "MXN" } };
    expect(normalizeEcartPayResult(r, options)).toBe(r);
  });

  it("lanza con el mensaje del SDK si success: false", () => {
    expect(() =>
      normalizeEcartPayResult({ success: false, error: { message: "Declinada" } }, options),
    ).toThrow("Declinada");
  });

  it("construye el payment desde id y el total de items", () => {
    expect(normalizeEcartPayResult({ id: "p1" }, options)).toEqual({
      success: true,
      payment: { id: "p1", status: "completed", amount: 25, currency: "MXN" },
      order: undefined,
    });
  });

  it("lanza con un objeto que solo trae error", () => {
    expect(() => normalizeEcartPayResult({ error: "x" }, options)).toThrow(
      "Unexpected response format",
    );
  });

  it("lanza con resultado vacío", () => {
    expect(() => normalizeEcartPayResult(null, options)).toThrow("Unexpected response format");
  });
});

describe("createEcartPayCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lanza si el SDK no está cargado", async () => {
    await expect(createEcartPayCheckout(options)).rejects.toThrow("SDK not loaded");
  });

  it("llama a Pay.Checkout.create y normaliza", async () => {
    const create = vi.fn().mockResolvedValue({ id: "p1" });
    vi.stubGlobal("window", { Pay: { Checkout: { create } } });
    const res = await createEcartPayCheckout(options);
    expect(create).toHaveBeenCalledWith(options);
    expect(res.payment?.id).toBe("p1");
  });
});

describe("waitForEcartPaySDK", () => {
  it("resuelve true en cuanto el SDK aparece y false al agotar el tiempo", async () => {
    vi.useFakeTimers();
    let loaded = false;
    const ok = waitForEcartPaySDK(1000, () => loaded);
    await vi.advanceTimersByTimeAsync(300);
    loaded = true;
    await vi.advanceTimersByTimeAsync(100);
    await expect(ok).resolves.toBe(true);

    const ko = waitForEcartPaySDK(500, () => false);
    await vi.advanceTimersByTimeAsync(700);
    await expect(ko).resolves.toBe(false);
    vi.useRealTimers();
  });
});
