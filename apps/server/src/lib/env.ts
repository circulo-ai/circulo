import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

const getEnv = (variable: string) => process.env[variable];

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return undefined;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

export const env = createEnv({
  // Local builds may intentionally omit secrets, but a production process
  // must fail fast instead of starting with an incomplete security config.
  skipValidation: process.env.NODE_ENV !== "production",
  server: {
    // Core app/auth
    DATABASE_URL: z.url(),
    CIRCULO_DATABASE_DRIVER: z
      .enum(["postgres", "pglite"])
      .optional()
      .default("postgres"),
    PGLITE_DATA_DIR: z.string().optional(),
    CIRCULO_MIGRATIONS_PATH: z.string().optional(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Encryption helpers derive a 32-byte AES key from exactly 64 hex chars.
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
    INTERNAL_API_SECRET: z.string().min(32),
    CIRCULO_DEPLOYMENT_MODE: z
      .enum(["local", "server"])
      .optional()
      .default("server"),
    // Distinguishes the product identity boundary from the infrastructure
    // mode. `local` deployment mode is retained for compatibility and maps to
    // the desktop runtime when this value is omitted.
    CIRCULO_RUNTIME_KIND: z
      .enum(["cloud", "self-hosted", "desktop"])
      .optional(),
    AUTUMN_SECRET_KEY: z.string().optional(),
    // Local development should exercise collaboration and automation limits
    // by default. Production never reads this override (see autumn.ts).
    BILLING_LOCAL_DEV_PLAN: z
      .enum(["free", "pro", "team", "enterprise"])
      .optional(),
    E2B_API_KEY: z.string().optional(),

    // OAuth credentials
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITHUB_REPO_CLIENT_ID: z.string().optional(),
    GITHUB_REPO_CLIENT_SECRET: z.string().optional(),
    X_CLIENT_ID: z.string().optional(),
    X_CLIENT_SECRET: z.string().optional(),
    CONFLUENCE_CLIENT_ID: z.string().optional(),
    CONFLUENCE_CLIENT_SECRET: z.string().optional(),
    JIRA_CLIENT_ID: z.string().optional(),
    JIRA_CLIENT_SECRET: z.string().optional(),
    AIRTABLE_CLIENT_ID: z.string().optional(),
    AIRTABLE_CLIENT_SECRET: z.string().optional(),
    SUPABASE_CLIENT_ID: z.string().optional(),
    SUPABASE_CLIENT_SECRET: z.string().optional(),
    NOTION_CLIENT_ID: z.string().optional(),
    NOTION_CLIENT_SECRET: z.string().optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    HUBSPOT_CLIENT_ID: z.string().optional(),
    HUBSPOT_CLIENT_SECRET: z.string().optional(),
    WEALTHBOX_CLIENT_ID: z.string().optional(),
    WEALTHBOX_CLIENT_SECRET: z.string().optional(),
    LINEAR_CLIENT_ID: z.string().optional(),
    LINEAR_CLIENT_SECRET: z.string().optional(),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    REDDIT_CLIENT_ID: z.string().optional(),
    REDDIT_CLIENT_SECRET: z.string().optional(),

    // Billing toggle
    BILLING_ENABLED: booleanFromEnv.optional(),

    // Storage (S3/Azure)
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanFromEnv.optional(),
    S3_BUCKET_NAME: z.string().optional(),
    S3_EXECUTION_FILES_BUCKET_NAME: z.string().optional(),
    S3_KB_BUCKET_NAME: z.string().optional(),
    S3_CHAT_BUCKET_NAME: z.string().optional(),
    S3_PROFILE_PICTURES_BUCKET_NAME: z.string().optional(),
    CIRCULO_STORAGE_DRIVER: z.enum(["local", "s3", "azure"]).optional(),
    CIRCULO_LOCAL_STORAGE_PATH: z.string().optional(),
    AZURE_ACCOUNT_NAME: z.string().optional(),
    AZURE_ACCOUNT_KEY: z.string().optional(),
    AZURE_CONNECTION_STRING: z.string().optional(),
    AZURE_STORAGE_CONTAINER_NAME: z.string().optional(),
    AZURE_STORAGE_KB_CONTAINER_NAME: z.string().optional(),
    AZURE_STORAGE_EXECUTION_FILES_CONTAINER_NAME: z.string().optional(),
    AZURE_STORAGE_CHAT_CONTAINER_NAME: z.string().optional(),
    AZURE_STORAGE_PROFILE_PICTURES_CONTAINER_NAME: z.string().optional(),

    // Email
    RESEND_API_KEY: z.string().optional(),
    AZURE_ACS_CONNECTION_STRING: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().optional(),

    // Redis / caching
    REDIS_URL: z.url().optional(),

    // AI
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.url().optional(),
    OPENROUTER_HTTP_REFERER: z.url().optional(),
    OPENROUTER_APP_TITLE: z.string().optional(),
    OPENROUTER_DEFAULT_MODEL: z.string().min(1).optional(),
    CIRCULO_EMBEDDING_MODEL: z
      .string()
      .min(1)
      .optional()
      .default("openai/text-embedding-3-small"),
    CIRCULO_VISION_MODEL: z.string().min(1).optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    TRUSTED_PROXY_HOPS: z.string().optional().default("0"),
    // Comma-separated IPs or CIDR ranges for the reverse proxy in front of
    // Better Auth. Forwarded client-IP headers are only trusted from these
    // explicitly configured proxy addresses.
    TRUSTED_PROXY_IPS: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    OLLAMA_API_KEY: z.string().min(1).optional(),
    OLLAMA_URL: z.url().optional().default("http://127.0.0.1:11434"),
    CIRCULO_MODEL_PRICING_JSON: z.string().optional(),

    // Logging
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
    // Inngest / workflow
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    INNGEST_BASE_URL: z.string().optional(),

    // Scheduled tasks / rate limiting
    CRON_SECRET: z.string().optional(),
    RATE_LIMIT_WINDOW_MS: z.string().optional().default("60000"),
    MANUAL_EXECUTION_LIMIT: z.string().optional().default("999999"),
    RATE_LIMIT_FREE_SYNC: z.string().optional().default("10"),
    RATE_LIMIT_FREE_ASYNC: z.string().optional().default("50"),
    RATE_LIMIT_PRO_SYNC: z.string().optional().default("25"),
    RATE_LIMIT_PRO_ASYNC: z.string().optional().default("200"),
    RATE_LIMIT_TEAM_SYNC: z.string().optional().default("75"),
    RATE_LIMIT_TEAM_ASYNC: z.string().optional().default("500"),
    RATE_LIMIT_ENTERPRISE_SYNC: z.string().optional().default("150"),
    RATE_LIMIT_ENTERPRISE_ASYNC: z.string().optional().default("1000"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_BILLING_ENABLED: booleanFromEnv.optional(),
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().optional(),
    NEXT_PUBLIC_CIRCULO_CLOUD_SYNC_URL: z.url().optional(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    NEXT_TELEMETRY_DISABLED: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BILLING_ENABLED: process.env.NEXT_PUBLIC_BILLING_ENABLED,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    NEXT_PUBLIC_CIRCULO_CLOUD_SYNC_URL:
      process.env.NEXT_PUBLIC_CIRCULO_CLOUD_SYNC_URL,
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
