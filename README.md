# Even Checkout Core

Monorepo de las apps de cliente de Even (Tap & Pay, Tap Order & Pay, Pick & Go, Room Service y FlexBill).
Cada app se despliega por separado, pero todas comparten el mismo núcleo de checkout y pagos.

## Estructura

```
apps/
  checkout-demo/      App de prueba que consume los paquetes compartidos
packages/
  payments/           @even/payments    Flujo de pago con Ecart Pay, tarjetas, Apple Pay, CardScanner
  api-client/         @even/api-client  Cliente HTTP tipado para even-backend
  ui/                 @even/ui          Primitivas de UI (Button, Input, Modal, layout...), tema de Tailwind y marca
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
- Tailwind CSS 4, ESLint 9, Vitest

## Comandos

Requiere Node 22 (`.nvmrc`).

```bash
npm install
npm run dev          # todas las apps en modo desarrollo
npm run build        # build de todo
npm run typecheck
npm run lint
npm run test
```

Para una sola app: `npx turbo run dev --filter=checkout-demo`.

## Despliegue en Vercel

Cada app es un proyecto de Vercel distinto apuntando a este repo, con **Root Directory** en `apps/<app>`.
Vercel detecta Turborepo y solo reconstruye la app cuando cambia ella o un paquete que usa.

## Migración

1. Esqueleto del monorepo (este estado).
2. `@even/payments` y `@even/api-client` desde Tap Order & Pay y Room Service, con tests E2E del checkout.
3. Migrar el resto de apps una por una, sin congelar el desarrollo en los repos actuales.
