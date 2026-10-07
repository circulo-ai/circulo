import { createEnv } from "@t3-oss/env-nextjs";
import { env as runtimeEnv } from "next-runtime-env";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return undefined;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const optionalUrlFromEnv = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional(),
);

const getEnv = (variable: string) =>
  runtimeEnv(variable) ?? process.env[variable];

export const env = createEnv({
  skipValidation: process.env.NODE_ENV !== "production",
  server: {
    DATABASE_URL: z.url(),
    BILLING_ENABLED: booleanFromEnv.optional(),
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_BILLING_ENABLED: booleanFromEnv.optional(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().optional(),
    NEXT_PUBLIC_BRAND_LOGO_URL: optionalUrlFromEnv,
    NEXT_PUBLIC_BRAND_FAVICON_URL: optionalUrlFromEnv,
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().optional(),
    NEXT_PUBLIC_CIRCULO_RUNTIME_KIND: z
      .enum(["cloud", "self-hosted", "desktop"])
      .optional(),
    // Comma-separated object-storage origins used by browser presigned uploads.
    NEXT_PUBLIC_STORAGE_ORIGINS: z.string().optional(),
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
    NEXT_PUBLIC_CIRCULO_RUNTIME_KIND:
      process.env.NEXT_PUBLIC_CIRCULO_RUNTIME_KIND,
    NEXT_PUBLIC_STORAGE_ORIGINS: process.env.NEXT_PUBLIC_STORAGE_ORIGINS,
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
