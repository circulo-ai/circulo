import { serve } from "inngest/hono";
import { inngest } from "./client";
import { orchestrateFunction } from "@/workflows/orchestrate/inngest";

export const inngestRouter = serve({
  client: inngest,
  functions: [orchestrateFunction],
});
