import { inngest } from "@/lib/inngest/client";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";

export const orchestrateFunction = inngest.createFunction(
  { id: "orchestrate-workflow" },
  { event: "app/orchestrate.run" },
  async ({ event }) => {
    const data = event.data as OrchestrationInput;
    const result = await orchestrateWorkflow(data);
    return { data: result };
  },
);