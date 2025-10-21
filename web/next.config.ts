import { env } from "@/lib/env";
import { isDev } from "@/lib/environment";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  experimental: {
    optimizeCss: true,
    turbopackSourceMaps: false,
  },
  transpilePackages: [
    "prettier",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
    "@ton/ton",
  ],
  ...(isDev && {
    allowedDevOrigins: [
      ...(env.NEXT_PUBLIC_APP_URL
        ? (() => {
            try {
              return [new URL(env.NEXT_PUBLIC_APP_URL).host];
            } catch {
              return [];
            }
          })()
        : []),
      "localhost:3000",
    ],
  }),
};

export default nextConfig;
