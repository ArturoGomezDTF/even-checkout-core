import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
  transpilePackages: ["@even/api-client", "@even/payments", "@even/ui"],
};

export default nextConfig;
