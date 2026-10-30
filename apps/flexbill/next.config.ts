import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
  transpilePackages: [
    "@even/api-client",
    "@even/cart",
    "@even/payments",
    "@even/ui",
  ],
  async headers() {
    return [
      {
        source: "/app.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
