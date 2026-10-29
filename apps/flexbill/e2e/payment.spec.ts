import { PAYMENT_INTENT_STORAGE_KEY } from "@even/payments";
import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, TABLE_ORDER_ID, mockFlexBillApi } from "./mocks";

const rejected = (error: string) => ({ status: 422, body: { success: false, code: "payment_rejected", error } });

test("lista las tarjetas guardadas a través de @even/payments", async ({ page }) => {
  const paymentsApi = await mockFlexBillApi(page);
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("Selecciona tu método de pago")).toBeVisible();
  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect(page.getByText("**** 5454")).toBeVisible();
  expect(paymentsApi.requests).toContainEqual({ method: "GET", path: "/payment-methods", body: null });
});

test("el cobro de la cuenta lleva los campos de Flex Bill al backend", async ({ page }) => {
  const paymentsApi = await mockFlexBillApi(page);
  await page.goto(CARD_SELECTION_URL);
  await expect(page.getByText("**** 4242")).toBeVisible();

  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();
  const charges = () => paymentsApi.requests.filter((r) => r.method === "POST" && r.path === "/payments");
  await expect.poll(() => charges().length).toBe(1);

  const body = charges()[0].body as Record<string, unknown>;
  expect(body).toMatchObject({
    paymentMethodId: "pm_visa_4242",
    amount: 360,
    baseAmount: 360,
    id_table_order: TABLE_ORDER_ID,
    payment_type: "full-bill",
  });
  expect(body.intentKey).toBeTruthy();
});

test("payment_rejected descarta el intento y el reintento usa otra clave de cobro", async ({ page }) => {
  const paymentsApi = await mockFlexBillApi(page, {
    payments: { processPayment: rejected("La tarjeta fue rechazada por el banco") },
  });
  await page.goto(CARD_SELECTION_URL);
  await expect(page.getByText("**** 4242")).toBeVisible();

  const charges = () => paymentsApi.requests.filter((r) => r.method === "POST" && r.path === "/payments");
  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();

  await expect(page.getByText("Pago rechazado")).toBeVisible();
  await expect(page.getByText("La tarjeta fue rechazada por el banco")).toBeVisible();
  // Sin intento guardado, otra tarjeta no recibe el replay del rechazo.
  expect(await page.evaluate((key) => sessionStorage.getItem(key), PAYMENT_INTENT_STORAGE_KEY)).toBeNull();

  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await expect(page.getByText("Pago rechazado")).toBeHidden();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect.poll(() => charges().length).toBe(2);

  const [first, second] = charges().map((r) => r.body as { intentKey: string });
  expect(second.intentKey).not.toBe(first.intentKey);
});

test("un rechazo definitivo de la orden de wallet oculta Apple y Google Pay", async ({ page }) => {
  await mockFlexBillApi(page, { walletOrder: rejected("Monto inválido") });
  await page.goto(CARD_SELECTION_URL);

  await expect(
    page.getByText("Apple Pay y Google Pay no están disponibles para este pedido. Paga con una tarjeta guardada."),
  ).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(0);
  await expect(page.getByText("**** 4242")).toBeVisible();
});

test("un error pasajero de la orden de wallet no la oculta", async ({ page }) => {
  // Por defecto el mock responde 503 a la orden de wallet.
  await mockFlexBillApi(page);
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect(page.locator("#apple-pay-container")).toHaveCount(1);
  await expect(page.getByText("Apple Pay y Google Pay no están disponibles")).toHaveCount(0);
});
