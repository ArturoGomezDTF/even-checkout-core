import { PAYMENT_INTENT_STORAGE_KEY } from "@even/payments";
import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, cartWithClubSandwich, mockPickAndGoApi } from "./mocks";

const rejected = (error: string) => ({ status: 422, body: { success: false, code: "payment_rejected", error } });

test("payment_rejected descarta el intento y el reintento usa otra clave", async ({ page }) => {
  // La animación del pedido deja unos segundos para deshacer antes de cobrar.
  test.slow();
  const paymentsApi = await mockPickAndGoApi(page, {
    cartItems: cartWithClubSandwich,
    payments: { processPayment: rejected("La tarjeta fue rechazada por el banco") },
  });
  await page.goto(CARD_SELECTION_URL);
  await expect(page.getByText("•••• 4242")).toBeVisible();

  const charges = () => paymentsApi.requests.filter((r) => r.method === "POST" && r.path === "/payments");
  const firstCharge = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/payments"));
  await page.getByRole("button", { name: "Pagar y ordenar" }).click();
  await firstCharge;

  await expect(page.getByText("Pago rechazado")).toBeVisible();
  await expect(page.getByText("La tarjeta fue rechazada por el banco")).toBeVisible();
  // Sin intento guardado, otra tarjeta no recibe el replay del rechazo.
  expect(await page.evaluate((key) => localStorage.getItem(key), PAYMENT_INTENT_STORAGE_KEY)).toBeNull();

  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await page.getByText("•••• 5454").click();
  await page.getByRole("button", { name: "Pagar y ordenar" }).click();
  await expect.poll(() => charges().length, { timeout: 20_000 }).toBe(2);

  const [first, second] = charges().map((r) => r.body as { intentKey: string; paymentMethodId: string });
  expect(first.paymentMethodId).toBe("pm_visa_4242");
  expect(second.paymentMethodId).toBe("pm_mc_5454");
  expect(second.intentKey).not.toBe(first.intentKey);
});

test("un rechazo definitivo de la orden de wallet oculta Apple y Google Pay", async ({ page }) => {
  await mockPickAndGoApi(page, {
    cartItems: cartWithClubSandwich,
    walletOrder: rejected("Monto inválido"),
  });
  await page.goto(CARD_SELECTION_URL);

  await expect(
    page.getByText("Apple Pay y Google Pay no están disponibles para este pedido. Paga con una tarjeta guardada."),
  ).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(0);
  await expect(page.getByText("•••• 4242")).toBeVisible();
});

test("un error pasajero de la orden de wallet no la oculta", async ({ page }) => {
  // Por defecto el mock responde 503 a la orden de wallet.
  await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("•••• 4242")).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(1);
  await expect(page.getByText("Apple Pay y Google Pay no están disponibles")).toHaveCount(0);
});
