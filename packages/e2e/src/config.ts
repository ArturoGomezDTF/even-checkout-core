import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/**
 * Host falso de even-backend. Las apps se construyen con
 * `NEXT_PUBLIC_API_URL` apuntando aquí y los tests interceptan cada petición:
 * si algo se escapa sin mock, el fixture `test` lo marca como fallo.
 */
export const E2E_API_URL = "http://api.e2e.test";

export interface EvenPlaywrightOptions {
  /** Puerto del servidor de la app. Uno distinto por app para no reutilizar un `next dev` local. */
  port: number;
  /** Variables extra para el build y el servidor de la app. */
  env?: Record<string, string>;
  /** Overrides directos de la config de Playwright. */
  overrides?: PlaywrightTestConfig;
}

/**
 * Config de Playwright común a todas las apps: levanta la app con `next build`
 * + `next start` (igual que producción) contra la API falsa. El build va a
 * `.next-e2e` (`NEXT_DIST_DIR`), así corre en paralelo con el build normal.
 */
export function createPlaywrightConfig({ port, env, overrides }: EvenPlaywrightOptions) {
  const ci = !!process.env.CI;
  const baseURL = `http://localhost:${port}`;

  return defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: ci,
    retries: ci ? 2 : 0,
    workers: ci ? 1 : undefined,
    reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
    use: {
      baseURL,
      locale: "es-MX",
      timezoneId: "America/Mexico_City",
      trace: "on-first-retry",
      screenshot: "only-on-failure",
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      // Las apps de Even se usan sobre todo desde el celular, tras escanear un QR.
      { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
      command: `next build && next start --port ${port}`,
      url: baseURL,
      reuseExistingServer: !ci,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_URL: E2E_API_URL,
        // La app debe leerlo en `distDir` de su next.config para no pisar `.next`.
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
        ...env,
      },
    },
    ...overrides,
  });
}
