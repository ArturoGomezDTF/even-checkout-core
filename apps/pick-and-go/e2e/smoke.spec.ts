import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, MENU_URL, cartWithClubSandwich, mockPickAndGoApi } from "./mocks";

test("el menú de la sucursal muestra el restaurante y sus platillos", async ({ page }) => {
  await mockPickAndGoApi(page);
  await page.goto(MENU_URL);

  await expect(page).toHaveTitle("Cafetería E2E | Pick & Go");
  await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$180.00 MXN")).toBeVisible();
});

test("lista las tarjetas guardadas a través de @even/payments", async ({ page }) => {
  const paymentsApi = await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("•••• 4242")).toBeVisible();
  await expect(page.getByText("•••• 5454")).toBeVisible();
  expect(paymentsApi.requests).toContainEqual({ method: "GET", path: "/payment-methods", body: null });
});
