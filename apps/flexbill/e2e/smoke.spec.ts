import { expect, test } from "@even/e2e";
import { MENU_URL, PAYMENT_OPTIONS_URL, mockFlexBillApi } from "./mocks";

test("el menú de la mesa carga sus platillos", async ({ page }) => {
  await mockFlexBillApi(page);
  await page.goto(MENU_URL);

  await expect(page.getByText("Mesa 12")).toBeVisible();
  await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$180.00 MXN")).toBeVisible();
});

test("la cuenta de la mesa ofrece las formas de dividir el pago", async ({ page }) => {
  await mockFlexBillApi(page);
  await page.goto(PAYMENT_OPTIONS_URL);

  await expect(page.getByText("Elige cómo quieres pagar la cuenta")).toBeVisible();
  await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
  await expect(page.getByText("Seleccionar artículos")).toBeVisible();
  await expect(page.getByText("Dividir cuenta")).toBeVisible();
  await expect(page.getByText("Elegir monto")).toBeVisible();
});
