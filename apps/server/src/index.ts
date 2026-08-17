import app from "@/app";
import { startScheduler } from "@/services/scheduler";

const port = Number.parseInt(process.env.PORT || "3002", 10);

startScheduler();

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server is running on http://localhost:${port}`);
