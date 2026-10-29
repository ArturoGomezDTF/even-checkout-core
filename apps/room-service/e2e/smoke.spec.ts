import { expect, test } from "@even/e2e";
import { CARD_SELECTION_URL, MENU_URL, cartWithClubSandwich, mockRoomServiceApi } from "./mocks";

test("la raíz redirige al menú de la habitación por defecto", async ({ page }) => {
  await mockRoomServiceApi(page);
  await page.goto("/");

  await expect(page).toHaveURL(MENU_URL);
  await expect(page).toHaveTitle("Hotel E2E | Room Service");
  await expect(page.getByText("Habitación 40")).toBeVisible();
  await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$180.00 MXN")).toBeVisible();
});

test("lista las tarjetas guardadas a través de @even/payments", async ({ page }) => {
  const paymentsApi = await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
  await page.goto(CARD_SELECTION_URL);

  await expect(page.getByText("Selecciona tu método de pago")).toBeVisible();
  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect(page.getByText("**** 5454")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pagar y ordenar" })).toBeVisible();
  expect(paymentsApi.requests).toContainEqual({ method: "GET", path: "/payment-methods", body: null });
});
