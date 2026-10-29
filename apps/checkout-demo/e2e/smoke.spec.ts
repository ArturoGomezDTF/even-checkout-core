import { expect, test } from "@even/e2e";

test("la home carga y lista los paquetes compartidos", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Even Checkout Demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Even Checkout Core");
  for (const name of ["@even/api-client", "@even/payments", "@even/ui"]) {
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
});

test("navega de la home a métodos de pago", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Métodos de pago" }).click();

  await expect(page).toHaveURL("/pagos");
  await expect(page.getByRole("heading", { name: "Métodos de pago" })).toBeVisible();
});
