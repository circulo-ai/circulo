import { env } from "@/lib/env";
import { isDev } from "@/lib/environment";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  serverExternalPackages: ['pdf-parse'],
  transpilePackages: [
    "prettier",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
    "@ton/ton",
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 2000, // Check for changes every second
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.next/**"],
      };
    }
    return config;
  },
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

export default withWorkflow(nextConfig);
