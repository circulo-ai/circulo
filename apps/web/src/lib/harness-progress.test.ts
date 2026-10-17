import type { HarnessSnapshot } from "@circulo-ai/types";
import { describe, expect, it } from "vitest";
import { getHarnessProgress } from "./harness-progress";
import type { ChatMessage } from "./types";

const snapshot: HarnessSnapshot = {
  executionId: "execution",
  agentId: "agent",
  goal: "Report",
  tasks: [
    {
      id: "write",
      title: "Write report",
      verification: "Saved report exists",
      evidenceKind: "tool",
      expectedTools: ["createDocument"],
      dependsOn: [],
      status: "running",
      evidence: [],
      note: "",
    },
  ],
  status: "running",
  modelSteps: 1,
  toolCalls: 1,
  tokens: 10,
  contextCompactions: 0,
  updatedAt: "2026-10-14T00:00:00Z",
};
describe("harness progress projection", () => {
  it("updates one execution in place and restores its terminal checklist from a durable trace", () => {
    const completed = {
      ...snapshot,
      status: "completed",
      tasks: snapshot.tasks.map((task) => ({ ...task, status: "completed" })),
    };
    expect(
      getHarnessProgress([
        { type: "data-workflowHarnessProgress", data: snapshot },
        {
          type: "data-workflowHarnessProgress",
          data: { ...snapshot, modelSteps: 2 },
        },
        {
          type: "data-workflowTrace",
          data: { agents: [{ harness: completed }] },
        },
      ] as unknown as ChatMessage["parts"]),
    ).toEqual([completed]);
  });
  it("keeps blockers visible even without a plan and hides unplanned simple answers", () => {
    expect(
      getHarnessProgress([
        {
          type: "data-workflowHarnessProgress",
          data: { ...snapshot, tasks: [] },
        },
      ] as unknown as ChatMessage["parts"]),
    ).toHaveLength(0);
    expect(
      getHarnessProgress([
        {
          type: "data-workflowHarnessProgress",
          data: {
            ...snapshot,
            status: "blocked",
            tasks: [],
            reason: "Missing access",
          },
        },
      ] as unknown as ChatMessage["parts"]),
    ).toHaveLength(1);
  });
});
