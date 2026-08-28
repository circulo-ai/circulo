import app from "@/app";
import { closeDbPool } from "@/db";
import { startScheduler } from "@/services/scheduler";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { closeSharedRedis } from "@circulo-ai/redis";

const port = Number.parseInt(process.env.PORT || "3002", 10);
const hostname =
  process.env.NODE_ENV === "development" ? "127.0.0.1" : undefined;

const stopScheduler = startScheduler();

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
