# Even Checkout Core

Monorepo de las apps de cliente de Even (Tap & Pay, Tap Order & Pay, Pick & Go, Room Service y FlexBill).
Cada app se despliega por separado, pero todas comparten el mismo núcleo de checkout y pagos.

## Estructura

```
apps/
  checkout-demo/      App de prueba que consume los paquetes compartidos
  tap-order-pay/      Tap Order & Pay (migrada desde LetsEven/even-tap-order-pay)
  room-service/       Room Service (migrada desde LetsEven/even-room-service)
  pick-and-go/        Pick & Go (migrada desde LetsEven/even-pick-and-go)
  tap-and-pay/        Tap & Pay (migrada desde LetsEven/even-tap-and-pay)
  flexbill/           FlexBill: dividir y pagar la cuenta de la mesa (migrada desde LetsEven/even-flexbill)
packages/
  payments/           @even/payments    Flujo de pago con Ecart Pay, tarjetas, Apple Pay, CardScanner
  api-client/         @even/api-client  Cliente HTTP tipado para even-backend
  ui/                 @even/ui          Primitivas de UI (Button, Input, Modal, layout...), tema de Tailwind y marca
  e2e/                @even/e2e         Config de Playwright y mocks de even-backend para tests E2E
  tsconfig/           @even/tsconfig    Configuración base de TypeScript
  eslint-config/      @even/eslint-config  Reglas de ESLint compartidas
```

Los paquetes `@even/*` exportan TypeScript fuente y cada app los compila con `transpilePackages`; no hay paso de build por paquete.

## UI compartida

Cada app importa el tema de `@even/ui` justo después de Tailwind y carga las fuentes con `next/font`
(variables `--font-dm-mono` y `--font-jakarta`, ver `apps/checkout-demo/src/app/layout.tsx`):

```css
@import "tailwindcss";
@import "@even/ui/theme.css";
```

El tema trae los colores de marca (`even-grass`, `even-evergreen`...), los semánticos (`primary`, `muted`, `danger`...),
animaciones y utilidades (`scrollbar-hide`, `even-highlight`, `min-h-screen-safe`). El catálogo vive en `/ui` de `checkout-demo`.

## Stack

- npm workspaces + Turborepo
- Next.js 16.4 y React 19.2 en todas las apps (una sola versión)
- Tailwind CSS 4, ESLint 9, Vitest, Playwright

## Comandos

Requiere Node 22 (`.nvmrc`).

```bash
npm install
npm run dev          # todas las apps en modo desarrollo
npm run build        # build de todo
npm run typecheck
npm run lint
npm run test
npm run e2e          # Playwright (la primera vez: npx playwright install chromium)
```

Para una sola app: `npx turbo run dev --filter=checkout-demo`.

## Tests E2E

Cada app con E2E tiene `playwright.config.ts` usando `createPlaywrightConfig` de `@even/e2e` y sus specs en `e2e/`.
La app se construye con `NEXT_PUBLIC_API_URL=http://api.e2e.test` en `.next-e2e` (la app debe leer `NEXT_DIST_DIR` en `distDir`) y corre en Desktop Chrome y Pixel 7.

Los specs importan `test` y `expect` de `@even/e2e`, no de `@playwright/test`. Ese `test` cierra la red: los endpoints de pagos se mockean solos (`paymentsApi`), y cualquier otra petición fuera de la app se aborta y hace fallar el test, así nunca se llama a even-backend ni a Ecart Pay. Solo cubre peticiones del navegador, no fetch en Server Components.

```ts
test("muestra el error del backend", async ({ page, paymentsApi }) => {
  paymentsApi.override("GET /payment-methods", { status: 500, body: { success: false, error: "Caído" } });
  await page.goto("/pagos");
});
```

## Despliegue en Vercel

Cada app es un proyecto de Vercel distinto apuntando a este repo, con **Root Directory** en `apps/<app>`.
Vercel detecta Turborepo y solo reconstruye la app cuando cambia ella o un paquete que usa.

## Migración

1. Esqueleto del monorepo (este estado).
2. `@even/payments` y `@even/api-client` desde Tap Order & Pay y Room Service, con tests E2E del checkout.
3. Migrar el resto de apps una por una, sin congelar el desarrollo en los repos actuales.
