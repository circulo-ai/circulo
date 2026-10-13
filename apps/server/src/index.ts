import app from "@/app";
import { closeDbPool, waitForDb } from "@/db";
import { env } from "@/lib/env";
import { startScheduler } from "@/services/scheduler";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { closeSharedRedis } from "@circulo-ai/redis";

const port = env.PORT ?? 3002;
const hostname = env.NODE_ENV === "development" ? "127.0.0.1" : undefined;

await waitForDb();

const stopScheduler = startScheduler();

// Process lifecycle is written straight to stdout rather than through
// `createLogger`: these lines must appear whatever LOG_LEVEL is set to (the
// logger defaults to ERROR-only in production), and they are the process
// talking about itself, not application logging.
let shutdownPromise: Promise<void> | undefined;
async function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= (async () => {
    console.log(`[Server] received ${signal}; shutting down gracefully`);
    stopScheduler();
    await workflowRunService.shutdown();
    await closeDbPool();
    await closeSharedRedis();
  })();
  await shutdownPromise;
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
process.once("SIGINT", () => {
  void shutdown("SIGINT").then(
    () => process.exit(0),
    () => process.exit(1),
  );
});

export default {
  port,
  ...(hostname ? { hostname } : {}),
  fetch: app.fetch,
  // Chat orchestration can legitimately be idle while an agent/model call is
  // running. The stream channel also emits UI heartbeats, but keep Bun's
  // timeout above the default 10 seconds as a second line of defense.
  idleTimeout: 255,
};

console.log(`Server is running on http://localhost:${port}`);
