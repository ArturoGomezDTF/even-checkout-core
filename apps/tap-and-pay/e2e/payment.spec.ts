import { PAYMENT_INTENT_STORAGE_KEY } from "@even/payments";
import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, ORDER_ID, mockTapAndPayApi } from "./mocks";

const rejected = (error: string) => ({ status: 422, body: { success: false, code: "payment_rejected", error } });

test("payment_rejected descarta el intento y el reintento usa otra clave", async ({ page }) => {
  // La animación del pedido deja unos segundos antes de cobrar.
  test.slow();
  const paymentsApi = await mockTapAndPayApi(page, {
    payments: { processPayment: rejected("La tarjeta fue rechazada por el banco") },
  });
  await page.goto(CARD_SELECTION_URL);
  await expect(page.getByText("**** 4242")).toBeVisible();

  const charges = () => paymentsApi.requests.filter((r) => r.method === "POST" && r.path === "/payments");
  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();

  await expect(page.getByText("Pago rechazado")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("La tarjeta fue rechazada por el banco")).toBeVisible();
  // Sin intento guardado, otra tarjeta no recibe el replay del rechazo.
  expect(await page.evaluate((key) => localStorage.getItem(key), PAYMENT_INTENT_STORAGE_KEY)).toBeNull();

  await page.getByRole("button", { name: /intentar de nuevo/i }).click();
  await page.getByText("**** 5454").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect.poll(() => charges().length, { timeout: 20_000 }).toBe(2);

  const [first, second] = charges().map(
    (r) => r.body as { intentKey: string; paymentMethodId: string; id_tap_pay_order: string },
  );
  expect(first.paymentMethodId).toBe("pm_visa_4242");
  expect(second.paymentMethodId).toBe("pm_mc_5454");
  expect(second.intentKey).not.toBe(first.intentKey);
  // Los ids de la orden de Tap & Pay siguen viajando en el cobro.
  expect(first.id_tap_pay_order).toBe(ORDER_ID);
});

test("un rechazo definitivo de la orden de wallet oculta Apple y Google Pay", async ({ page }) => {
  await mockTapAndPayApi(page, { walletOrder: rejected("Monto inválido") });
  await page.goto(CARD_SELECTION_URL);

  await expect(
    page.getByText("Apple Pay y Google Pay no están disponibles para este pedido. Paga con una tarjeta guardada."),
  ).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(0);
  await expect(page.getByText("**** 4242")).toBeVisible();
});

test("un error pasajero de la orden de wallet no la oculta", async ({ page }) => {
  // Por defecto el mock responde 503 a la orden de wallet.
  await mockTapAndPayApi(page);
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(1);
  await expect(page.getByText("Apple Pay y Google Pay no están disponibles")).toHaveCount(0);
});
