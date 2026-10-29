// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EcartPayCheckoutOptions } from "../ecartpay";
import { useEcartPay } from "./useEcartPay";

const options: EcartPayCheckoutOptions = {
  publicID: "pub",
  order: {
    email: "a@b.c",
    first_name: "A",
    last_name: "B",
    currency: "MXN",
    items: [{ name: "x", price: 10, quantity: 1 }],
  },
};

afterEach(() => {
  delete window.Pay;
  vi.restoreAllMocks();
});

describe("useEcartPay", () => {
  it("devuelve el resultado normalizado", async () => {
    window.Pay = { Checkout: { create: vi.fn().mockResolvedValue({ id: "p1" }) } };
    const { result } = renderHook(() => useEcartPay());
    expect(result.current.isSDKLoaded()).toBe(true);
    let res;
    await act(async () => {
      res = await result.current.createCheckout(options);
    });
    expect(res).toMatchObject({ success: true, payment: { id: "p1", amount: 10 } });
    expect(result.current.isLoading).toBe(false);
  });

  it("expone el error y lo limpia", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useEcartPay());
    await act(async () => {
      await expect(result.current.createCheckout(options)).rejects.toThrow("not loaded");
    });
    expect(result.current.error).toMatch("not loaded");
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
