import { createRouter } from "@/lib/create-app";
import { env } from "@/lib/env";
import { getDb } from "@circulo-ai/db";
import { createRedis } from "@circulo-ai/redis";
import { sql } from "drizzle-orm";

const router = createRouter();

router.get("/", (c) =>
  c.json({
    service: "circulo-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

router.get("/health", (c) =>
  c.json({
    service: "circulo-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

router.get("/health/ready", async (c) => {
  const checks: Record<string, "ok" | "not_configured" | "failed"> = {};

  try {
    await withTimeout(getDb().execute(sql`select 1`), 2_000);
    checks.database = "ok";
  } catch {
    checks.database = "failed";
  }

  if (env.REDIS_URL) {
    try {
      const redis = createRedis({ url: env.REDIS_URL, namespace: "health" });
      await withTimeout(redis.ping(), 2_000);
      checks.redis = "ok";
    } catch {
      checks.redis = "failed";
    }
  } else {
    checks.redis = "not_configured";
  }

  const ready = checks.database === "ok" && checks.redis !== "failed";
  return c.json(
    {
      service: "circulo-api",
      status: ready ? "ready" : "not_ready",
      checks,
      timestamp: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
});

export default router;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Health check timed out")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
