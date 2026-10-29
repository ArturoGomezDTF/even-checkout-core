import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
  transpilePackages: ["@even/api-client", "@even/payments"],
  // Security headers are now handled by middleware.ts with dynamic nonces
  // for PCI DSS compliance (no unsafe-inline in CSP)
};

export default withNextIntl(nextConfig);
