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

export const env = createEnv({
  skipValidation: true,

  server: {
    E2B_ENABLED: z.boolean().default(false),

    API_ENCRYPTION_KEY: z.string().min(32).optional(), // Dedicated key for encrypting API keys (optional for OSS)

    TONAPI_API_KEY: z.string(),

    // OAuth Integration Credentials - All optional, enables third-party integrations
    GOOGLE_CLIENT_ID: z.string().optional(), // Google OAuth client ID for Google services
    GOOGLE_CLIENT_SECRET: z.string().optional(), // Google OAuth client secret
    GITHUB_CLIENT_ID: z.string().optional(), // GitHub OAuth client ID for GitHub integration
    GITHUB_CLIENT_SECRET: z.string().optional(), // GitHub OAuth client secret
    GITHUB_REPO_CLIENT_ID: z.string().optional(), // GitHub OAuth client ID for repo access
    GITHUB_REPO_CLIENT_SECRET: z.string().optional(), // GitHub OAuth client secret for repo access
    X_CLIENT_ID: z.string().optional(), // X (Twitter) OAuth client ID
    X_CLIENT_SECRET: z.string().optional(), // X (Twitter) OAuth client secret
    CONFLUENCE_CLIENT_ID: z.string().optional(), // Atlassian Confluence OAuth client ID
    CONFLUENCE_CLIENT_SECRET: z.string().optional(), // Atlassian Confluence OAuth client secret
    JIRA_CLIENT_ID: z.string().optional(), // Atlassian Jira OAuth client ID
    JIRA_CLIENT_SECRET: z.string().optional(), // Atlassian Jira OAuth client secret
    AIRTABLE_CLIENT_ID: z.string().optional(), // Airtable OAuth client ID
    AIRTABLE_CLIENT_SECRET: z.string().optional(), // Airtable OAuth client secret
    SUPABASE_CLIENT_ID: z.string().optional(), // Supabase OAuth client ID
    SUPABASE_CLIENT_SECRET: z.string().optional(), // Supabase OAuth client secret
    NOTION_CLIENT_ID: z.string().optional(), // Notion OAuth client ID
    NOTION_CLIENT_SECRET: z.string().optional(), // Notion OAuth client secret
    DISCORD_CLIENT_ID: z.string().optional(), // Discord OAuth client ID
    DISCORD_CLIENT_SECRET: z.string().optional(), // Discord OAuth client secret
    MICROSOFT_CLIENT_ID: z.string().optional(), // Microsoft OAuth client ID for Office 365/Teams
    MICROSOFT_CLIENT_SECRET: z.string().optional(), // Microsoft OAuth client secret
    HUBSPOT_CLIENT_ID: z.string().optional(), // HubSpot OAuth client ID
    HUBSPOT_CLIENT_SECRET: z.string().optional(), // HubSpot OAuth client secret
    WEALTHBOX_CLIENT_ID: z.string().optional(), // WealthBox OAuth client ID
    WEALTHBOX_CLIENT_SECRET: z.string().optional(), // WealthBox OAuth client secret
    LINEAR_CLIENT_ID: z.string().optional(), // Linear OAuth client ID
    LINEAR_CLIENT_SECRET: z.string().optional(), // Linear OAuth client secret
    SLACK_CLIENT_ID: z.string().optional(), // Slack OAuth client ID
    SLACK_CLIENT_SECRET: z.string().optional(), // Slack OAuth client secret
    REDDIT_CLIENT_ID: z.string().optional(), // Reddit OAuth client ID
    REDDIT_CLIENT_SECRET: z.string().optional(), // Reddit OAuth client secret

    // Payment & Billing
    STRIPE_SECRET_KEY: z.string().min(1).optional(), // Stripe secret key for payment processing
    STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(), // Stripe publishable key for client-side SDK
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(), // General Stripe webhook secret
    STRIPE_FREE_PRICE_ID: z.string().min(1).optional(), // Stripe price ID for free tier
    FREE_TIER_COST_LIMIT: z.number().optional(), // Cost limit for free tier users
    FREE_STORAGE_LIMIT_GB: z.number().optional().default(5), // Storage limit in GB for free tier users
    STRIPE_PRO_PRICE_ID: z.string().min(1).optional(), // Stripe price ID for pro tier
    PRO_TIER_COST_LIMIT: z.number().optional(), // Cost limit for pro tier users
    PRO_STORAGE_LIMIT_GB: z.number().optional().default(50), // Storage limit in GB for pro tier users
    STRIPE_TEAM_PRICE_ID: z.string().min(1).optional(), // Stripe price ID for team tier
    TEAM_TIER_COST_LIMIT: z.number().optional(), // Cost limit for team tier users
    TEAM_STORAGE_LIMIT_GB: z.number().optional().default(500), // Storage limit in GB for team tier organizations (pooled)
    STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1).optional(), // Stripe price ID for enterprise tier
    ENTERPRISE_TIER_COST_LIMIT: z.number().optional(), // Cost limit for enterprise tier users
    ENTERPRISE_STORAGE_LIMIT_GB: z.number().optional().default(500), // Default storage limit in GB for enterprise tier (can be overridden per org)
    BILLING_ENABLED: z.boolean().optional(), // Enable billing enforcement and usage tracking
    OVERAGE_THRESHOLD_DOLLARS: z.number().optional().default(50), // Dollar threshold for incremental overage billing (default: $50)

    // Cloud Storage - S3-compatible (AWS, R2, MinIO)
    S3_ENDPOINT: z.string().optional(), // Custom endpoint for S3-compatible storage (leave empty for AWS)
    S3_REGION: z.string().optional(), // Region (use "auto"/"us-east-1" for R2/MinIO)
    S3_ACCESS_KEY_ID: z.string().optional(), // Access key for S3-compatible storage
    S3_SECRET_ACCESS_KEY: z.string().optional(), // Secret key for S3-compatible storage
    S3_FORCE_PATH_STYLE: z.boolean().optional(), // Force path-style URLs (true for R2/MinIO)
    S3_BUCKET_NAME: z.string().optional(), // S3 bucket for general file storage
    S3_EXECUTION_FILES_BUCKET_NAME: z.string().optional(), // S3 bucket for workflow execution files
    S3_KB_BUCKET_NAME: z.string().optional(), // S3 bucket for knowledge base files
    S3_CHAT_BUCKET_NAME: z.string().optional(), // S3 bucket for chat logos
    S3_COPILOT_BUCKET_NAME: z.string().optional(), // S3 bucket for copilot files
    S3_PROFILE_PICTURES_BUCKET_NAME: z.string().optional(), // S3 bucket for profile pictures

    // Cloud Storage - Azure Blob
    AZURE_ACCOUNT_NAME: z.string().optional(), // Azure storage account name
    AZURE_ACCOUNT_KEY: z.string().optional(), // Azure storage account key
    AZURE_CONNECTION_STRING: z.string().optional(), // Azure storage connection string
    AZURE_STORAGE_CONTAINER_NAME: z.string().optional(), // Azure container for general files
    AZURE_STORAGE_KB_CONTAINER_NAME: z.string().optional(), // Azure container for knowledge base files
    AZURE_STORAGE_EXECUTION_FILES_CONTAINER_NAME: z.string().optional(), // Azure container for workflow execution files
    AZURE_STORAGE_CHAT_CONTAINER_NAME: z.string().optional(), // Azure container for chat logos
    AZURE_STORAGE_COPILOT_CONTAINER_NAME: z.string().optional(), // Azure container for copilot files
    AZURE_STORAGE_PROFILE_PICTURES_CONTAINER_NAME: z.string().optional(), // Azure container for profile pictures

    // Telegram
    BOT_TOKEN: z.string(),

    // Email
    RESEND_API_KEY: z.string().min(1).optional(), // Resend API key for transactional emails
    AZURE_ACS_CONNECTION_STRING: z.string().optional(), // Azure Communication Services connection string

    // Core Database & Authentication
    DATABASE_URL: z.url(), // Primary database connection string
    BETTER_AUTH_URL: z.url(), // Base URL for Better Auth service
    BETTER_AUTH_SECRET: z.string().min(32), // Secret key for Better Auth JWT signing
    ENCRYPTION_KEY: z.string().min(32), // Key for encrypting sensitive data
    INTERNAL_API_SECRET: z.string().min(32), // Secret for internal API authentication

    // Database & Storage
    REDIS_URL: z.url().optional(), // Redis connection string for caching/sessions

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
    OLLAMA_URL: z.url().optional(), // Ollama local LLM server URL
    ELEVENLABS_API_KEY: z.string().min(1).optional(), // ElevenLabs API key for text-to-speech in deployed chat

    // Monitoring & Analytics
    TELEMETRY_ENDPOINT: z.url().optional(), // Custom telemetry/analytics endpoint
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(), // Minimum log level to display (defaults to ERROR in production, DEBUG in development)

    // Infrastructure & Deployment
    NEXT_RUNTIME: z.string().optional(), // Next.js runtime environment
    DOCKER_BUILD: z.boolean().optional(), // Flag indicating Docker build environment

    // Background Jobs & Scheduling
    TRIGGER_SECRET_KEY: z.string(), // Trigger.dev webhook secret for task execution
    TRIGGER_API_URL: z.url().optional(), // Trigger.dev API base URL for self-hosted (e.g., http://localhost:8030)
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
  },

  client: {
    NEXT_PUBLIC_BILLING_ENABLED: z.boolean().optional(), // Enable billing enforcement and usage tracking (client-side)

    // Core Application URLs - Required for frontend functionality
    NEXT_PUBLIC_APP_URL: z.url(), // Base URL of the application (e.g., https://app.circulo.ir)

    // Trigger.dev Realtime base URL for self-hosted setups
    NEXT_PUBLIC_TRIGGER_API_URL: z.url().optional(),

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
    NEXT_PUBLIC_BILLING_ENABLED: process.env.NEXT_PUBLIC_BILLING_ENABLED,
    NEXT_PUBLIC_DEPOSIT_ADDRESS: process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TRIGGER_API_URL: process.env.NEXT_PUBLIC_TRIGGER_API_URL,
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
