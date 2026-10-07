import app from "@/app";
import { closeDbPool, waitForDb } from "@/db";
import { startScheduler } from "@/services/scheduler";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { closeSharedRedis } from "@circulo-ai/redis";
import { serve } from "@hono/node-server";

const port = Number.parseInt(process.env.PORT || "3002", 10);
const hostname = process.env.HOSTNAME || "127.0.0.1";

await waitForDb();
const stopScheduler = startScheduler();
const server = serve({ fetch: app.fetch, port, hostname });

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
