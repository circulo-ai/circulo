import { env, getEnv } from "@/lib/env";
import { isDev } from "@/lib/environment";
import type { NextConfig } from "next";

const apiBaseUrl =
  process.env.SERVER_API_URL ??
  process.env.API_BASE_URL ??
  "http://localhost:3002";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "api.stability.ai",
      },
      // Azure Blob Storage
      {
        protocol: "https",
        hostname: "*.blob.core.windows.net",
      },
      // AWS S3
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Brand logo domain if configured
      ...(getEnv("NEXT_PUBLIC_BRAND_LOGO_URL")
        ? (() => {
            try {
              return [
                {
                  protocol: "https" as const,
                  hostname: new URL(getEnv("NEXT_PUBLIC_BRAND_LOGO_URL")!)
                    .hostname,
                },
              ];
            } catch {
              return [];
            }
          })()
        : []),
      // Brand favicon domain if configured
      ...(getEnv("NEXT_PUBLIC_BRAND_FAVICON_URL")
        ? (() => {
            try {
              return [
                {
                  protocol: "https" as const,
                  hostname: new URL(getEnv("NEXT_PUBLIC_BRAND_FAVICON_URL")!)
                    .hostname,
                },
              ];
            } catch {
              return [];
            }
          })()
        : []),
    ],
    // Allow images served from our API routes (includes query strings like ?context=)
    localPatterns: [
      {
        pathname: "/api/files/serve/**",
      },
    ],
  },
  /* config options here */
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  serverExternalPackages: ["pdf-parse", "postgres"],
  transpilePackages: [
    "prettier",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
    "@react-email/components",
    "@react-email/render",
    "@circulo/db",
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
  async headers() {
    return [
      {
        // API routes CORS headers
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          {
            key: "Access-Control-Allow-Origin",
            value: env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,OPTIONS,PUT,DELETE",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key",
          },
        ],
      },
      // Block access to sourcemap files (defense in depth)
      {
        source: "/(.*)\\.map$",
        headers: [
          {
            key: "x-robots-tag",
            value: "noindex",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const normalizedApiBaseUrl = apiBaseUrl.endsWith("/")
      ? apiBaseUrl.slice(0, -1)
      : apiBaseUrl;

    return [
      {
        source: "/api/:path*",
        destination: `${normalizedApiBaseUrl}/api/:path*`,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
