# Even Checkout Core

Monorepo (npm workspaces + Turborepo) de las apps de cliente de Even. Ver README.md para estructura y comandos.

- Las apps viven en `apps/*`; el código compartido en `packages/*` con scope `@even/`.
- Los paquetes exportan TypeScript fuente (`exports: ./src/index.ts`); toda app que los use debe listarlos en `transpilePackages`.
- Una sola versión de Next, React y TypeScript en todo el repo. Al subir versión, súbela en todas las apps en el mismo PR.
- Antes de abrir un PR: `npx turbo run typecheck lint test build` debe pasar. No usar `ignoreBuildErrors`.
