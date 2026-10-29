import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
  transpilePackages: ["@even/api-client", "@even/payments", "@even/ui"],
  // Security headers are now handled by middleware.ts with dynamic nonces
  // for PCI DSS compliance (no unsafe-inline in CSP)
};

export default withNextIntl(nextConfig);
