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
    const serverClosed = new Promise<void>((resolve) => {
      server.close(() => resolve());
      (
        server as { closeIdleConnections?: () => void }
      ).closeIdleConnections?.();
    });
    await Promise.all([serverClosed, workflowRunService.shutdown()]);
    await closeDbPool();
    await closeSharedRedis();
  })();
  await shutdownPromise;
}

function requestShutdown(reason: string) {
  void shutdown(reason).then(
    () => process.exit(0),
    (error) => {
      console.error("[Node server] graceful shutdown failed", error);
      process.exit(1);
    },
  );
}

process.once("SIGTERM", () => requestShutdown("SIGTERM"));
process.once("SIGINT", () => requestShutdown("SIGINT"));

let desktopControlBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  desktopControlBuffer = `${desktopControlBuffer}${chunk}`.slice(-128);
  if (desktopControlBuffer.includes("CIRCULO_DESKTOP_SHUTDOWN")) {
    process.stdin.pause();
    requestShutdown("desktop shutdown request");
  }
});
process.stdin.once("end", () => {
  if (!shutdownPromise) requestShutdown("desktop parent disconnected");
});

console.log(`Node server is running on http://${hostname}:${port}`);
