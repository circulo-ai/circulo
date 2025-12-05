import { createEnv } from "@t3-oss/env-nextjs";
import { env as runtimeEnv } from "next-runtime-env";
import { z } from "zod";

const getEnv = (variable: string) =>
  runtimeEnv(variable) ?? process.env[variable];

export const env = createEnv({
  skipValidation: true,
  server: {
    DATABASE_URL: z.url(),
    BILLING_ENABLED: z.boolean().optional(),
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_BILLING_ENABLED: z.boolean().optional(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().optional(),
    NEXT_PUBLIC_BRAND_LOGO_URL: z.url().optional(),
    NEXT_PUBLIC_BRAND_FAVICON_URL: z.url().optional(),
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    NEXT_TELEMETRY_DISABLED: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BILLING_ENABLED: process.env.NEXT_PUBLIC_BILLING_ENABLED,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_BRAND_LOGO_URL: process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
    NEXT_PUBLIC_BRAND_FAVICON_URL: process.env.NEXT_PUBLIC_BRAND_FAVICON_URL,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED,
  },
});

export const isTruthy = (value: string | boolean | number | undefined) =>
  typeof value === "string"
    ? value.toLowerCase() === "true" || value === "1"
    : Boolean(value);

export const isFalsy = (value: string | boolean | number | undefined) =>
  typeof value === "string"
    ? value.toLowerCase() === "false" || value === "0"
    : value === false;

export { getEnv };
