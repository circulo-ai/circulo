import { env, getEnv } from "@/lib/env";
import { isDev } from "@/lib/environment";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'api.stability.ai',
      },
      // Azure Blob Storage
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
      // AWS S3
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      // Brand logo domain if configured
      ...(getEnv('NEXT_PUBLIC_BRAND_LOGO_URL')
        ? (() => {
          try {
            return [
              {
                protocol: 'https' as const,
                hostname: new URL(getEnv('NEXT_PUBLIC_BRAND_LOGO_URL')!).hostname,
              },
            ]
          } catch {
            return []
          }
        })()
        : []),
      // Brand favicon domain if configured
      ...(getEnv('NEXT_PUBLIC_BRAND_FAVICON_URL')
        ? (() => {
          try {
            return [
              {
                protocol: 'https' as const,
                hostname: new URL(getEnv('NEXT_PUBLIC_BRAND_FAVICON_URL')!).hostname,
              },
            ]
          } catch {
            return []
          }
        })()
        : []),
    ],
  },
  /* config options here */
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  serverExternalPackages: ['pdf-parse', 'postgres'],
  transpilePackages: [
    "prettier",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
    '@react-email/components',
    '@react-email/render',
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
  async headers() {
    return [
      {
        // API routes CORS headers
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          {
            key: 'Access-Control-Allow-Origin',
            value: env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,OPTIONS,PUT,DELETE',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key',
          },
        ],
      },
      // Block access to sourcemap files (defense in depth)
      {
        source: '/(.*)\\.map$',
        headers: [
          {
            key: 'x-robots-tag',
            value: 'noindex',
          },
        ],
      },
    ]
  }
};

export default withWorkflow(nextConfig);
