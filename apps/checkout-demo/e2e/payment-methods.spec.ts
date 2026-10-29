import { expect, mockPaymentsApi, test, visaCard } from "@even/e2e";

test("muestra las tarjetas guardadas del usuario", async ({ page, paymentsApi }) => {
  await page.goto("/pagos");

  const cards = page.getByRole("list", { name: "Tarjetas guardadas" }).getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("visa •••• 4242");
  await expect(cards.first()).toContainText("Predeterminada");
  await expect(cards.nth(1)).toContainText("mastercard •••• 5454");

  expect(paymentsApi.requests).toEqual([{ method: "GET", path: "/payment-methods", body: null }]);
});

test("muestra estado vacío sin tarjetas", async ({ page }) => {
  await mockPaymentsApi(page, { paymentMethods: [] });
  await page.goto("/pagos");

  await expect(page.getByText("No tienes tarjetas guardadas.")).toBeVisible();
});

test("muestra el error del backend", async ({ page, paymentsApi }) => {
  paymentsApi.override("GET /payment-methods", {
    status: 500,
    body: { success: false, error: "Servicio de pagos no disponible" },
  });
  await page.goto("/pagos");

  await expect(page.getByRole("alert").filter({ hasText: "Servicio de pagos no disponible" })).toBeVisible();
});

test("manda el token del usuario a la API", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("even_access_token", "token-e2e"));
  const request = page.waitForRequest((req) => req.url().endsWith("/payment-methods"));
  await page.goto("/pagos");

  expect((await request).headers()["authorization"]).toBe("Bearer token-e2e");
  await expect(page.getByText(`visa •••• ${visaCard.lastFourDigits}`)).toBeVisible();
});
