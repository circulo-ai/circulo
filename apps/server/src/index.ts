import app from "@/app";
import { startScheduler } from "@/services/scheduler";

const port = Number.parseInt(process.env.PORT || "3002", 10);

startScheduler();

export default {
  port,
  fetch: app.fetch,
  // Chat orchestration can legitimately be idle while an agent/model call is
  // running. The stream channel also emits UI heartbeats, but keep Bun's
  // timeout above the default 10 seconds as a second line of defense.
  idleTimeout: 255,
};

console.log(`Server is running on http://localhost:${port}`);
