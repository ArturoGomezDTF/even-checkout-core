import { describe, expect, it, vi } from "vitest";
import { pollConfirm, waitForChargedIntent } from "./polling";
import { fakeClock } from "./test/helpers";

describe("waitForChargedIntent", () => {
  it("acepta 'confirmed' además de 'charged'", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValue({ success: true, status: "confirmed", ecartpay_order_id: "ep" });
    expect(await waitForChargedIntent(getStatus, "k", fakeClock())).toBe("ep");
  });

  it("no acepta 'charged' sin ecartpay_order_id", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ success: true, status: "charged", ecartpay_order_id: null })
      .mockResolvedValue({ success: true, status: "charged", ecartpay_order_id: "ep" });
    expect(await waitForChargedIntent(getStatus, "k", fakeClock())).toBe("ep");
    expect(getStatus).toHaveBeenCalledTimes(2);
  });
});

describe("pollConfirm", () => {
  it("devuelve la orden confirmada", async () => {
    const confirm = vi.fn().mockResolvedValue({ success: true, data: { order: { id: "o1" } } });
    expect(await pollConfirm(confirm, fakeClock())).toEqual({ success: true, order: { id: "o1" } });
  });

  it("reintenta solo con confirm_in_progress", async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce({ success: false, code: "confirm_in_progress" })
      .mockResolvedValueOnce({ success: true, data: { order: { id: "o1" } } });
    expect(await pollConfirm(confirm, fakeClock())).toMatchObject({ success: true });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("otro error es terminal sin reintentar", async () => {
    const confirm = vi.fn().mockResolvedValue({ success: false, code: "order_not_found" });
    expect(await pollConfirm(confirm, fakeClock())).toEqual({ success: false });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("intenta al menos una vez aunque el timeout sea 0", async () => {
    const confirm = vi.fn().mockResolvedValue({ success: false, code: "confirm_in_progress" });
    await pollConfirm(confirm, { ...fakeClock(), timeoutMs: 0 });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("se rinde al agotar el tiempo", async () => {
    const confirm = vi.fn().mockResolvedValue({ success: false, code: "confirm_in_progress" });
    expect(await pollConfirm(confirm, { ...fakeClock(), intervalMs: 1000, timeoutMs: 5000 })).toEqual({
      success: false,
    });
    // t = 0, 1000, 2000, 3000, 4000
    expect(confirm).toHaveBeenCalledTimes(5);
  });
});
