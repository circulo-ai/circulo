import { createEnv } from "@t3-oss/env-nextjs";
import { env as runtimeEnv } from "next-runtime-env";
import { z } from "zod";

/**
 * Universal environment variable getter that works in both client and server contexts.
 * - Client-side: Uses next-runtime-env for runtime injection (supports Docker runtime vars)
 * - Server-side: Falls back to process.env when runtimeEnv returns undefined
 * - Provides seamless Docker runtime variable support for NEXT_PUBLIC_ vars
 */
const getEnv = (variable: string) =>
  runtimeEnv(variable) ?? process.env[variable];

// biome-ignore format: keep alignment for readability
export const env = createEnv({
  skipValidation: true,

  server: {
    // Telegram
    BOT_TOKEN: z.string(),

    // Email
    RESEND_API_KEY: z.string().min(1).optional(), // Resend API key for transactional emails
    AZURE_ACS_CONNECTION_STRING: z.string().optional(), // Azure Communication Services connection string

    // Core Database & Authentication
    DATABASE_URL: z.string().url(), // Primary database connection string
    BETTER_AUTH_URL: z.string().url(), // Base URL for Better Auth service
    BETTER_AUTH_SECRET: z.string().min(32), // Secret key for Better Auth JWT signing
    ENCRYPTION_KEY: z.string().min(32), // Key for encrypting sensitive data
    INTERNAL_API_SECRET: z.string().min(32), // Secret for internal API authentication

    // Database & Storage
    REDIS_URL: z.string().url().optional(), // Redis connection string for caching/sessions

    // AI/LLM Provider API Keys
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(), // Primary OpenAI API key
    DEEPSEEK_API_KEY: z.string().min(1).optional(), // Primary OpenAI API key
    OPENAI_API_KEY: z.string().min(1).optional(), // Primary OpenAI API key
    OPENAI_API_KEY_1: z.string().min(1).optional(), // Additional OpenAI API key for load balancing
    OPENAI_API_KEY_2: z.string().min(1).optional(), // Additional OpenAI API key for load balancing
    OPENAI_API_KEY_3: z.string().min(1).optional(), // Additional OpenAI API key for load balancing
    MISTRAL_API_KEY: z.string().min(1).optional(), // Mistral AI API key
    ANTHROPIC_API_KEY_1: z.string().min(1).optional(), // Primary Anthropic Claude API key
    ANTHROPIC_API_KEY_2: z.string().min(1).optional(), // Additional Anthropic API key for load balancing
    ANTHROPIC_API_KEY_3: z.string().min(1).optional(), // Additional Anthropic API key for load balancing
    OLLAMA_URL: z.string().url().optional(), // Ollama local LLM server URL
    ELEVENLABS_API_KEY: z.string().min(1).optional(), // ElevenLabs API key for text-to-speech in deployed chat

    // Monitoring & Analytics
    TELEMETRY_ENDPOINT: z.string().url().optional(), // Custom telemetry/analytics endpoint
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(), // Minimum log level to display (defaults to ERROR in production, DEBUG in development)

    // Infrastructure & Deployment
    NEXT_RUNTIME: z.string().optional(), // Next.js runtime environment
    DOCKER_BUILD: z.boolean().optional(), // Flag indicating Docker build environment

    // Background Jobs & Scheduling
    INNGEST_EVENT_KEY: z.string().optional(), // Inngest event key for background jobs
    INNGEST_SIGNING_KEY: z.string().optional(), // Inngest signing key for webhook verification
    CRON_SECRET: z.string().optional(), // Secret for authenticating cron job requests
    JOB_RETENTION_DAYS: z.string().optional().default("1"), // Days to retain job logs/data

    // Rate Limiting Configuration
    RATE_LIMIT_WINDOW_MS: z.string().optional().default("60000"), // Rate limit window duration in milliseconds (default: 1 minute)
    MANUAL_EXECUTION_LIMIT: z.string().optional().default("999999"), // Manual execution bypass value (effectively unlimited)
    RATE_LIMIT_FREE_SYNC: z.string().optional().default("10"), // Free tier sync API executions per minute
    RATE_LIMIT_FREE_ASYNC: z.string().optional().default("50"), // Free tier async API executions per minute
    RATE_LIMIT_PRO_SYNC: z.string().optional().default("25"), // Pro tier sync API executions per minute
    RATE_LIMIT_PRO_ASYNC: z.string().optional().default("200"), // Pro tier async API executions per minute
    RATE_LIMIT_TEAM_SYNC: z.string().optional().default("75"), // Team tier sync API executions per minute
    RATE_LIMIT_TEAM_ASYNC: z.string().optional().default("500"), // Team tier async API executions per minute
    RATE_LIMIT_ENTERPRISE_SYNC: z.string().optional().default("150"), // Enterprise tier sync API executions per minute
    RATE_LIMIT_ENTERPRISE_ASYNC: z.string().optional().default("1000"), // Enterprise tier async API executions per minute

    // OAuth Integration Credentials - All optional, enables third-party integrations
    GOOGLE_CLIENT_ID: z.string().optional(), // Google OAuth client ID for Google services
    GOOGLE_CLIENT_SECRET: z.string().optional(), // Google OAuth client secret
    GITHUB_CLIENT_ID: z.string().optional(), // GitHub OAuth client ID for GitHub integration
    GITHUB_CLIENT_SECRET: z.string().optional(), // GitHub OAuth client secret
  },

  client: {
    // Core Application URLs - Required for frontend functionality
    NEXT_PUBLIC_APP_URL: z.string().url(), // Base URL of the application (e.g., https://app.sim.ai)

    // Google Services - For client-side Google integrations
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(), // Google OAuth client ID for browser auth

    // Analytics & Tracking
    NEXT_PUBLIC_GOOGLE_API_KEY: z.string().optional(), // Google API key for client-side API calls
    NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER: z.string().optional(), // Google project number for Drive picker
  },

  // Variables available on both server and client
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).optional(), // Runtime environment
    NEXT_TELEMETRY_DISABLED: z.string().optional(), // Disable Next.js telemetry collection
    NEXT_PUBLIC_DEPOSIT_ADDRESS: z.string(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_DEPOSIT_ADDRESS: process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER:
      process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED,
  },
});

// Need this utility because t3-env is returning string for boolean values.
export const isTruthy = (value: string | boolean | number | undefined) =>
  typeof value === "string"
    ? value.toLowerCase() === "true" || value === "1"
    : Boolean(value);

// Utility to check if a value is explicitly false (defaults to false only if explicitly set)
export const isFalsy = (value: string | boolean | number | undefined) =>
  typeof value === "string"
    ? value.toLowerCase() === "false" || value === "0"
    : value === false;

export { getEnv };
