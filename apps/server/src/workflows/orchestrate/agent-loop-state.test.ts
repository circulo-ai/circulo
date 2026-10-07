import { describe, expect, it } from "vitest";
import {
  addAgentTasks,
  createAgentTaskId,
  markAgentTasksRunning,
  recordAgentTaskResults,
  type AgentTaskDescriptor,
} from "./agent-loop-state";

const descriptor = (
  overrides: Partial<AgentTaskDescriptor> = {},
): AgentTaskDescriptor => ({
  agentId: "agent-1",
  task: "inspect the repository",
  order: 0,
  iteration: 1,
  priority: "medium",
  dependsOn: [],
  ...overrides,
});

describe("agent task ledger", () => {
  it("deduplicates tasks using stable task identities", () => {
    const first = descriptor();
    const ledger = addAgentTasks(addAgentTasks([], [first]), [first]);

    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.taskId).toBe(createAgentTaskId(first));
  });

  it("records terminal outcomes without overwriting older task attempts", () => {
    const first = descriptor();
    const second = descriptor({ iteration: 2, order: 1, task: "verify fixes" });
    let ledger = addAgentTasks([], [first, second], 100);
    ledger = markAgentTasksRunning(ledger, [first], 200);
    ledger = recordAgentTaskResults(
      ledger,
      [{ ...first, success: false, error: "tool failed" }],
      300,
    );
    ledger = markAgentTasksRunning(ledger, [second], 400);
    ledger = recordAgentTaskResults(
      ledger,
      [{ ...second, success: true }],
      500,
    );

    expect(ledger.map((entry) => entry.status)).toEqual([
      "failed",
      "completed",
    ]);
    expect(ledger[0]?.completedAt).toBe(300);
    expect(ledger[1]?.completedAt).toBe(500);
  });
});
