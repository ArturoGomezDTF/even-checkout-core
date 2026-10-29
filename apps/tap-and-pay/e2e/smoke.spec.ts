import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, ORDER_URL, mockTapAndPayApi, tapPayOrder } from "./mocks";

test("la raíz con mesa lleva a la cuenta de la mesa", async ({ page }) => {
  await mockTapAndPayApi(page);
  await page.goto("/?table=1&restaurant=5");

  await expect(page).toHaveURL(/\/5\/2\/order\?table=1/);
  await expect(page.getByText("Tacos al pastor")).toBeVisible();
  await expect(page.getByText("$360.00").first()).toBeVisible();
});

test("una mesa sin cuenta abierta no rompe la pantalla", async ({ page }) => {
  await mockTapAndPayApi(page, { order: null });
  await page.goto(ORDER_URL);

  await expect(page.getByText("Tacos al pastor")).toHaveCount(0);
  await expect(page.getByText(tapPayOrder.order_id)).toHaveCount(0);
});

test("lista las tarjetas guardadas a través de @even/payments", async ({ page }) => {
  const paymentsApi = await mockTapAndPayApi(page);
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect(page.getByText("**** 5454")).toBeVisible();
  expect(paymentsApi.requests).toContainEqual({ method: "GET", path: "/payment-methods", body: null });
});
