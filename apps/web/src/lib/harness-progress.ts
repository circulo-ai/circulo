import type { HarnessSnapshot } from "@circulo-ai/types";
import type { ChatMessage } from "./types";

export function getHarnessProgress(
  parts: ChatMessage["parts"],
): HarnessSnapshot[] {
  const latest = new Map<string, HarnessSnapshot>();
  for (const part of parts as unknown as Array<{
    type: string;
    data?: unknown;
  }>) {
    if (part.type === "data-workflowHarnessProgress") {
      const snapshot = part.data as HarnessSnapshot;
      if (snapshot?.executionId && Array.isArray(snapshot.tasks))
        latest.set(snapshot.executionId, snapshot);
    }
    if (part.type === "data-workflowTrace") {
      const trace = part.data as {
        agents?: Array<{ harness?: HarnessSnapshot }>;
      };
      for (const agent of trace.agents ?? [])
        if (agent.harness) latest.set(agent.harness.executionId, agent.harness);
    }
  }
  return [...latest.values()].filter(
    (snapshot) =>
      snapshot.tasks.length ||
      snapshot.status === "blocked" ||
      snapshot.status === "paused",
  );
}
