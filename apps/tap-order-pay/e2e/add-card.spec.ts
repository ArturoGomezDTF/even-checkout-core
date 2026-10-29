import { expect, test } from "@even/e2e";
import { mockTapOrderApi } from "./api";

const ADD_CARD = "/15/1/add-card?table=2";

test.beforeEach(async ({ page }) => {
  // El layout carga el SDK de EcartPay; un stub vacío basta para estas pantallas.
  await page.route("https://pay.ecart.com/sdk/pay.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
});

test("muestra el formulario para agregar tarjeta", async ({ page }) => {
  await mockTapOrderApi(page);
  const sdk = page.waitForRequest("https://pay.ecart.com/sdk/pay.js");
  await page.goto(ADD_CARD);

  await expect(page).toHaveTitle("Even Tap Order & Pay");
  await expect(page.getByText("Agrega tu tarjeta para continuar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  await sdk;
});

test("valida los campos requeridos sin guardar la tarjeta", async ({ page }) => {
  const paymentsApi = await mockTapOrderApi(page);
  await page.goto(ADD_CARD);
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Ingresa tu nombre completo")).toBeVisible();
  expect(paymentsApi.requests.filter((r) => r.method === "POST")).toEqual([]);
});

test("guarda la tarjeta a través de @even/payments", async ({ page }) => {
  const paymentsApi = await mockTapOrderApi(page);
  await page.goto(ADD_CARD);
  await page.getByPlaceholder("John Doe").fill("Ana Lopez");
  await page.getByPlaceholder("**** 2098").fill("4242 4242 4242 4242");
  await page.getByPlaceholder("123").fill("123");

  const saved = page.waitForRequest((req) => req.method() === "POST" && req.url().endsWith("/payment-methods"));
  await page.getByRole("button", { name: "Guardar" }).click();
  await saved;

  expect(paymentsApi.requests).toContainEqual({
    method: "POST",
    path: "/api/payment-methods",
    body: expect.objectContaining({ fullName: "Ana Lopez", cvv: "123" }),
  });
});
