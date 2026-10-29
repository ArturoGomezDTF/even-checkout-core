import type { Page } from "@playwright/test";
import { mockPaymentsApi } from "@even/e2e";

/**
 * La app asume que NEXT_PUBLIC_API_URL termina en /api y que el host no
 * empieza con "api" (middleware.ts y algunos servicios hacen
 * `replace("/api", "")` para obtener el host del CSP).
 */
// https: el CSP de la app incluye upgrade-insecure-requests.
export const API_URL = "https://backend.e2e.test/api";

/**
 * Mock de even-backend para Tap Order & Pay: los endpoints de pago con
 * `mockPaymentsApi` y el resto (restaurante, carrito...) responde 404, así la
 * app sigue en su camino de error sin salir a la red.
 */
export async function mockTapOrderApi(page: Page) {
  // Se registra antes: Playwright evalúa las rutas en orden inverso.
  await page.route(`${API_URL}/**`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 404, json: { success: false, error: "not mocked" } }),
  );
  return mockPaymentsApi(page, { apiUrl: API_URL });
}
