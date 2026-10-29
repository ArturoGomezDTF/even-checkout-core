import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
  transpilePackages: ["@even/api-client", "@even/payments", "@even/ui"],
};

export default nextConfig;
