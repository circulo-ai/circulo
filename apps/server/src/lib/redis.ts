import { createRedis, type CirculoRedis } from "@circulo-ai/redis";
import { createLogger } from "@/lib/logs/console/logger";

const logger = createLogger("Redis");

let cachedClient: CirculoRedis | null | undefined;

function getLogger(): (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void {
  return (level, message, meta) => {
    const log = (logger as any)[level] ?? logger.info;
    log(message, meta);
  };
}

/**
 * Get or create a shared Redis client. Returns null if REDIS_URL is not set or initialization fails.
 */
export function getRedisClient(): CirculoRedis | null {
  if (typeof window !== "undefined") return null;
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    cachedClient = null;
    return null;
  }

  try {
    cachedClient = createRedis({
      url,
      reuse: true,
      namespace: "circulo",
      logger: getLogger(),
      options: {
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        keepAlive: 1000,
      },
    });
  } catch (error) {
    logger.error("Failed to initialize Redis client:", { error });
    cachedClient = null;
  }

  return cachedClient;
}