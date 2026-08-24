/**
 * Environment utility functions for consistent environment detection across the application
 */
import { env, isTruthy } from "./env";

/**
 * Is the application running in production mode
 */
export const isProd = env.NODE_ENV === "production";

/**
 * Is the application running in development mode
 */
export const isDev = env.NODE_ENV === "development";

/**
 * Is the application running in test mode
 */
export const isTest = env.NODE_ENV === "test";

/**
 * Is billing enforcement enabled
 */
// This module is imported by client components. Use the public billing flag
// here instead of the server-only BILLING_ENABLED field; reading a server
// field through @t3-oss/env-nextjs throws during production hydration.
export const isBillingEnabled = isTruthy(env.NEXT_PUBLIC_BILLING_ENABLED);

/**
 * Is this the hosted version of the application
 */
export const isHosted =
  env.NEXT_PUBLIC_APP_URL === "https://www.circulo-ai.com" ||
  env.NEXT_PUBLIC_APP_URL === "https://www.staging.circulo-ai.com";
