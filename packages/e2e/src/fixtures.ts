import { test as base, expect } from "@playwright/test";
import { mockPaymentsApi, type PaymentsApiMock } from "./mocks/payments";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

interface EvenFixtures {
  /** Peticiones bloqueadas por salir de la app sin mock. El test falla si hay alguna. */
  blockedRequests: string[];
  paymentsApi: PaymentsApiMock;
}

/**
 * `test` de Playwright con red cerrada: toda petición fuera de la app que no
 * tenga mock se aborta y hace fallar el test, así nunca se llama a
 * even-backend, Ecart Pay ni otro servicio real.
 */
export const test = base.extend<EvenFixtures>({
  blockedRequests: [
    async ({ page }, use) => {
      const blocked: string[] = [];
      // Se registra primero: Playwright evalúa las rutas en orden inverso,
      // así que los mocks específicos tienen prioridad sobre este guard.
      await page.route(
        (url) => !LOCAL_HOSTS.has(url.hostname) && !url.protocol.startsWith("data"),
        (route, request) => {
          blocked.push(`${request.method()} ${request.url()}`);
          return route.abort("blockedbyclient");
        },
      );
      await use(blocked);
      expect(blocked, "Peticiones externas sin mock").toEqual([]);
    },
    { auto: true },
  ],
  // Automático para que cualquier test pueda abrir pantallas que piden tarjetas o cobran.
  // Depende de `blockedRequests` para registrarse después del guard.
  paymentsApi: [
    async ({ page, blockedRequests }, use) => {
      void blockedRequests;
      await use(await mockPaymentsApi(page));
    },
    { auto: true },
  ],
});

export { expect };
