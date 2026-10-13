import app from "@/app";
import { closeDbPool, waitForDb } from "@/db";
import { env } from "@/lib/env";
import { startScheduler } from "@/services/scheduler";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { closeSharedRedis } from "@circulo-ai/redis";
import { serve } from "@hono/node-server";

const port = env.PORT ?? 3002;
const hostname = env.HOSTNAME || "127.0.0.1";

await waitForDb();
const stopScheduler = startScheduler();
const server = serve({ fetch: app.fetch, port, hostname });

// Process lifecycle is written straight to stdout rather than through
// `createLogger`: these lines must appear whatever LOG_LEVEL is set to (the
// logger defaults to ERROR-only in production), and they are the process
// talking about itself, not application logging.
let shutdownPromise: Promise<void> | undefined;
async function shutdown(signal: string) {
  shutdownPromise ??= (async () => {
    console.log(`[Node server] received ${signal}; shutting down gracefully`);
    stopScheduler();
    await workflowRunService.shutdown();
    await closeDbPool();
    await closeSharedRedis();
    server.close();
  })();
  await shutdownPromise;
}

process.once(
  "SIGTERM",
  () => void shutdown("SIGTERM").then(() => process.exit(0)),
);
process.once(
  "SIGINT",
  () => void shutdown("SIGINT").then(() => process.exit(0)),
);

console.log(`Node server is running on http://${hostname}:${port}`);
