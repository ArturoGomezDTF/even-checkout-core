import { describe, expect, it, vi } from "vitest";
import { chargeSavedCard, type ChargeSavedCardParams } from "./charge";
import { createPaymentIntentStore, type FingerprintInput } from "./idempotency";
import type { PaymentIntentStatusResponse } from "./types";
import { fakeClock, memoryStorage } from "./test/helpers";

const cart: FingerprintInput = {
  items: [{ menuItemId: "m1", quantity: 2 }],
  tipAmount: 10,
  total: 110,
};

const request: ChargeSavedCardParams["request"] = {
  paymentMethodId: "pm_1",
  amount: 110,
  currency: "MXN",
  description: "Pago Mesa 4",
  orderId: "order-1",
  tableNumber: "4",
  restaurantId: "r1",
};

function setup(
  processResults: unknown[],
  statusResults: PaymentIntentStatusResponse[] = [],
) {
  const storage = memoryStorage();
  const store = createPaymentIntentStore({ storage: () => storage });
  const processPayment = vi.fn();
  for (const r of processResults) processPayment.mockResolvedValueOnce(r);
  const getPaymentIntentStatus = vi.fn();
  for (const r of statusResults) getPaymentIntentStatus.mockResolvedValueOnce(r);
  getPaymentIntentStatus.mockResolvedValue({ success: true, status: "charging" });
  const clock = fakeClock();
  const service = { processPayment, getPaymentIntentStatus } as unknown as ChargeSavedCardParams["service"];
  const run = (onVerifying?: () => void) =>
    chargeSavedCard({
      service,
      store,
      fingerprintInput: cart,
      request,
      onVerifying,
      poll: { ...clock, intervalMs: 3000, timeoutMs: 60000 },
    });
  return { store, processPayment, getPaymentIntentStatus, run };
}

const fail = (code: string, extra: object = {}) => ({
  success: false,
  code,
  error: { code, message: `msg ${code}` },
  ...extra,
});

describe("chargeSavedCard", () => {
  it("cobra, manda intentKey/fingerprint y guarda el ecartpayOrderId", async () => {
    const { run, processPayment, store } = setup([{ success: true, payment: { id: "ep_1" } }]);

    const outcome = await run();

    expect(outcome).toMatchObject({ status: "charged", ecartpayOrderId: "ep_1", reused: false });
    const body = processPayment.mock.calls[0][0];
    expect(body).toMatchObject(request);
    expect(body.intentKey).toBe(store.get()?.intentKey);
    expect(body.fingerprint).toBe(store.get()?.fingerprint);
    expect(store.get()?.ecartpayOrderId).toBe("ep_1");
  });

  it("después de un cobro, reintentar NUNCA vuelve a llamar /payments", async () => {
    const { run, processPayment } = setup([{ success: true, payment: { id: "ep_1" } }]);

    await run();
    const retry = await run();

    expect(processPayment).toHaveBeenCalledOnce();
    expect(retry).toMatchObject({ status: "charged", ecartpayOrderId: "ep_1", reused: true });
  });

  it("marca reused cuando el backend re-juega un cobro anterior", async () => {
    const { run } = setup([{ success: true, replayed: true, payment: { id: "ep_1" } }]);
    expect(await run()).toMatchObject({ status: "charged", reused: true });
  });

  it("2xx sin payment.id es reintentable y conserva la misma clave", async () => {
    const { run, processPayment } = setup([
      { success: true },
      { success: true, payment: { id: "ep_2" } },
    ]);

    expect(await run()).toEqual({ status: "retryable", reason: "missing_order_id" });
    await run();

    const [first, second] = processPayment.mock.calls.map((c) => c[0].intentKey);
    expect(second).toBe(first);
  });

  it("intent_mismatch descarta el intento y la siguiente vez usa clave nueva", async () => {
    const { run, processPayment, store } = setup([
      fail("intent_mismatch", { status: 409 }),
      { success: true, payment: { id: "ep_1" } },
    ]);

    expect(await run()).toEqual({ status: "retryable", reason: "intent_mismatch" });
    expect(store.get()).toBeNull();
    await run();

    const [first, second] = processPayment.mock.calls.map((c) => c[0].intentKey);
    expect(second).not.toBe(first);
  });

  it("idempotency_unavailable es reintentable con la misma clave", async () => {
    const { run, store } = setup([fail("idempotency_unavailable", { status: 503 })]);
    const before = await store.ensure(cart);
    expect(await run()).toEqual({ status: "retryable", reason: "idempotency_unavailable" });
    expect(store.get()?.intentKey).toBe(before.intentKey);
  });

  it("payment_rejected descarta el intento y propaga el mensaje", async () => {
    const { run, store } = setup([fail("payment_rejected", { status: 422 })]);
    expect(await run()).toEqual({
      status: "retryable",
      reason: "payment_rejected",
      message: "msg payment_rejected",
    });
    expect(store.get()).toBeNull();
  });

  it("lee el código desde error.code si no viene en la raíz", async () => {
    const { run } = setup([{ success: false, error: { code: "payment_rejected" } }]);
    expect(await run()).toMatchObject({ reason: "payment_rejected" });
  });

  it.each(["payment_unknown", "charge_unconfirmed"])(
    "%s es terminal: no se ofrece recobrar y se conserva el intento",
    async (code) => {
      const { run, store } = setup([fail(code, { status: 502 })]);
      expect(await run()).toEqual({ status: "unconfirmed", reason: code });
      expect(store.get()).not.toBeNull();
    },
  );

  it("cualquier otro error (tarjeta declinada, red) es reintentable", async () => {
    const { run } = setup([{ success: false, error: { message: "Insufficient funds" } }]);
    expect(await run()).toEqual({
      status: "retryable",
      reason: "declined",
      message: "Insufficient funds",
    });
  });

  it("payment_in_progress espera el intent sin volver a llamar /payments", async () => {
    const onVerifying = vi.fn();
    const { run, processPayment, getPaymentIntentStatus, store } = setup(
      [fail("payment_in_progress", { status: 409 })],
      [
        { success: true, status: "charging" },
        { success: false },
        { success: true, status: "charged", ecartpay_order_id: "ep_9" },
      ],
    );

    const outcome = await run(onVerifying);

    expect(outcome).toMatchObject({ status: "charged", ecartpayOrderId: "ep_9", reused: true });
    expect(onVerifying).toHaveBeenCalledOnce();
    expect(processPayment).toHaveBeenCalledOnce();
    expect(getPaymentIntentStatus).toHaveBeenCalledTimes(3);
    expect(getPaymentIntentStatus).toHaveBeenCalledWith(store.get()?.intentKey);
    expect(store.get()?.ecartpayOrderId).toBe("ep_9");
  });

  it("payment_in_progress que termina en unknown es terminal", async () => {
    const { run } = setup(
      [fail("payment_in_progress")],
      [{ success: true, status: "unknown" }],
    );
    expect(await run()).toEqual({ status: "unconfirmed", reason: "in_progress_timeout" });
  });

  it("payment_in_progress que no resuelve antes del timeout es terminal", async () => {
    const { run, getPaymentIntentStatus } = setup([fail("payment_in_progress")]);
    expect(await run()).toEqual({ status: "unconfirmed", reason: "in_progress_timeout" });
    // 60 s / 3 s
    expect(getPaymentIntentStatus).toHaveBeenCalledTimes(20);
  });
});
