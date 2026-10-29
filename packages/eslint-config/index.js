import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Config compartida: todo el código del monorepo termina corriendo dentro de una app Next.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Todas las apps usan App Router; sin esto la regla busca un directorio pages/ en cada paquete.
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  globalIgnores([".next/**", ".next-e2e/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);
