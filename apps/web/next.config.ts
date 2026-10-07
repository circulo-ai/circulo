import { env, getEnv } from "@/lib/env";
import { isDev } from "@/lib/environment";
import type { NextConfig } from "next";
import path from "node:path";

const apiBaseUrl =
  process.env.SERVER_API_URL ??
  process.env.API_BASE_URL ??
  "http://localhost:3002";

const apiOrigin = (() => {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return "'self'";
  }
})();

const storageOrigins = [
  getOrigin(process.env.S3_ENDPOINT),
  ...(process.env.NEXT_PUBLIC_STORAGE_ORIGINS?.split(",") ?? []).map((value) =>
    getOrigin(value),
  ),
  process.env.AZURE_ACCOUNT_NAME?.trim()
    ? `https://${process.env.AZURE_ACCOUNT_NAME.trim()}.blob.core.windows.net`
    : undefined,
].filter((origin): origin is string => Boolean(origin));
const connectSources = [
  "'self'",
  apiOrigin,
  ...storageOrigins,
  "https://cdn.jsdelivr.net",
];

// Keep the policy explicit while preserving the product's intentional
// capabilities: Pyodide is loaded from jsDelivr, web previews are sandboxed
// iframes, and API traffic may use a separately hosted server origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Shiki's Oniguruma highlighter loads a WebAssembly grammar engine. The
  // narrower wasm-unsafe-eval source expression enables WebAssembly execution
  // without granting general JavaScript eval permissions.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https:",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
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
      { hostname: "circulo-minio-17cd9b-193-203-169-161.traefik.me" },
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
    // Resolve workspace-linked packages from the monorepo root. This keeps
    // Turbopack compatible with Bun's symlinked node_modules layout.
    root: path.resolve(__dirname, "../.."),
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  serverExternalPackages: ["pdf-parse", "postgres"],
  transpilePackages: [
    "prettier",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
    "@circulo-ai/upload",
    "@react-email/components",
    "@react-email/render",
    "@circulo-ai/types",
    "@better-auth-ui/core",
    "@better-auth-ui/react",
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
        // Baseline browser protections for every rendered page and API
        // response that passes through the Next.js proxy.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
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

function getOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
