import { describe, expect, it, vi } from "vitest";
import type { Requester } from "@even/api-client";
import { createPaymentService } from "./payment-service";

function mockRequester(response: unknown = { success: true }) {
  const fn = vi.fn().mockResolvedValue(response);
  return { fn, service: createPaymentService(fn as unknown as Requester) };
}

describe("createPaymentService", () => {
  it.each([
    ["getPaymentMethods", [], "/payment-methods", "GET"],
    ["deletePaymentMethod", ["pm 1"], "/payment-methods/pm%201", "DELETE"],
    ["setDefaultPaymentMethod", ["pm1"], "/payment-methods/pm1/default", "PUT"],
    ["getPaymentHistory", [], "/payments/history", "GET"],
    ["getMsiConfiguration", [], "/payments/installment-config", "GET"],
    ["getPaymentIntentStatus", ["k/1"], "/payments/intents/k%2F1", "GET"],
  ] as const)("%s → %s %s", async (method, args, endpoint, httpMethod) => {
    const { fn, service } = mockRequester();
    await (service[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    expect(fn).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: httpMethod }));
  });

  it.each([
    ["addPaymentMethod", "/payment-methods"],
    ["processPayment", "/payments"],
    ["createApplePayOrder", "/payments/apple-pay/order"],
    ["createGooglePayOrder", "/payments/google-pay/order"],
  ] as const)("%s hace POST a %s con el body en JSON", async (method, endpoint) => {
    const { fn, service } = mockRequester();
    const body = { amount: 1 };
    await (service[method] as (b: unknown) => Promise<unknown>)(body);
    expect(fn).toHaveBeenCalledWith(endpoint, { method: "POST", body: JSON.stringify(body) });
  });

  it("migrateGuestPaymentMethods manda el guestId", async () => {
    const { fn, service } = mockRequester();
    await service.migrateGuestPaymentMethods("g1");
    expect(fn).toHaveBeenCalledWith("/payment-methods/migrate-from-guest", {
      method: "POST",
      body: JSON.stringify({ guestId: "g1" }),
    });
  });

  it("adapta un error string al formato objeto", async () => {
    const { service } = mockRequester({ success: false, error: "boom" });
    expect(await service.getPaymentMethods()).toEqual({
      success: false,
      error: { type: "api_error", message: "boom" },
    });
  });

  it("getEcartOrderStatus lee el status plano", async () => {
    const { service } = mockRequester({ success: true, status: "paid" });
    expect(await service.getEcartOrderStatus("o1")).toBe("paid");
    const { service: empty } = mockRequester({ success: false });
    expect(await empty.getEcartOrderStatus("o1")).toBeNull();
  });
});
