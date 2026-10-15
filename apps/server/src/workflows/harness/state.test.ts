import type { HarnessSnapshot } from "@circulo-ai/types";
import { describe, expect, it } from "vitest";
import { boundModelContext } from "./context";
import {
  assessCompletion,
  needsHarnessPlan,
  revisePlan,
  toolFingerprint,
  toolOutputSucceeded,
  updateTask,
  type PlanTask,
} from "./state";

const initial = (): HarnessSnapshot => ({
  executionId: "execution",
  agentId: "agent",
  goal: "Research and create a verified report",
  tasks: [],
  status: "running",
  modelSteps: 0,
  toolCalls: 0,
  tokens: 0,
  contextCompactions: 0,
  updatedAt: "2026-10-14T00:00:00Z",
});
const task = (
  id = "research",
  overrides: Partial<PlanTask> = {},
): PlanTask => ({
  id,
  title: "Research sources",
  verification: "A successful source lookup returned relevant material",
  evidenceKind: "tool",
  expectedTools: ["searchKnowledge"],
  dependsOn: [],
  ...overrides,
});

describe("execution goal and evidence checks", () => {
  it("normalizes only namespace aliases of authorized tools", () => {
    expect(
      revisePlan(
        initial(),
        [task("source", { expectedTools: ["functions.searchKnowledge"] })],
        new Set(["searchKnowledge"]),
      )[0]!.expectedTools,
    ).toEqual(["searchKnowledge"]);
    expect(() =>
      revisePlan(
        initial(),
        [task("source", { expectedTools: ["functions.deleteEverything"] })],
        new Set(["searchKnowledge"]),
      ),
    ).toThrow("unavailable");
  });
  it("requires a plan for file work and explicit multi-step work", () => {
    expect(needsHarnessPlan("Create a saved document and read it back.")).toBe(
      true,
    );
    expect(needsHarnessPlan("Research the release requirements.")).toBe(true);
    expect(needsHarnessPlan("Track progress in a durable plan.")).toBe(true);
    expect(needsHarnessPlan("What is research?")).toBe(false);
    expect(needsHarnessPlan("Hello")).toBe(false);
  });
  it("rejects unknown tools, cycles, duplicate IDs, and missing dependencies", () => {
    const tools = new Set(["searchKnowledge"]);
    expect(() =>
      revisePlan(
        initial(),
        [task("a", { expectedTools: ["invented"] })],
        tools,
      ),
    ).toThrow("unavailable");
    expect(() =>
      revisePlan(
        initial(),
        [task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a"] })],
        tools,
      ),
    ).toThrow("cycle");
    expect(() => revisePlan(initial(), [task(), task()], tools)).toThrow(
      "unique",
    );
    expect(() =>
      revisePlan(initial(), [task("a", { dependsOn: ["missing"] })], tools),
    ).toThrow("Unknown dependency");
  });
  it("preserves requirements during replanning and completed checks are immutable", () => {
    const state = initial();
    state.tasks = revisePlan(state, [task()], new Set(["searchKnowledge"]));
    expect(() =>
      revisePlan(state, [task("replacement")], new Set(["searchKnowledge"])),
    ).toThrow("cannot be silently removed");
    state.tasks[0]!.status = "completed";
    expect(() =>
      revisePlan(
        state,
        [task("research", { title: "Different requirement" })],
        new Set(["searchKnowledge"]),
      ),
    ).toThrow("immutable");
  });
  it("requires genuine matching successful evidence and fulfilled dependencies", () => {
    const state = initial();
    state.tasks = revisePlan(
      state,
      [task(), task("report", { dependsOn: ["research"] })],
      new Set(["searchKnowledge"]),
    );
    const update = {
      id: "research",
      status: "completed" as const,
      evidence: ["proof"],
      note: "Source checked",
    };
    expect(() => updateTask(state, update, [])).toThrow("successful tool call");
    expect(() =>
      updateTask(state, update, [
        {
          toolCallId: "proof",
          toolName: "createDocument",
          successful: true,
          fingerprint: "f",
        },
      ]),
    ).toThrow("required tools");
    expect(() => updateTask(state, { ...update, id: "report" }, [])).toThrow(
      "dependencies",
    );
    state.tasks = updateTask(state, update, [
      {
        toolCallId: "proof",
        toolName: "searchKnowledge",
        successful: true,
        fingerprint: "f",
      },
    ]);
    expect(state.tasks[0]?.status).toBe("completed");
    expect(assessCompletion(state, "Done", "stop", []).success).toBe(false);
  });
  it.each(["pending", "failed", "rejected", "cancelled", "error"])(
    "does not treat %s as successful action evidence",
    (status) => {
      expect(toolOutputSucceeded({ status })).toBe(false);
    },
  );
  it("does not equate a response or exhausted budget with a verified goal", () => {
    expect(
      assessCompletion(initial(), "Finished", "tool-calls", []).success,
    ).toBe(false);
    expect(assessCompletion(initial(), "", "stop", []).success).toBe(false);
    expect(
      assessCompletion(initial(), "Finished", "stop", [], "Budget exhausted")
        .success,
    ).toBe(false);
    expect(assessCompletion(initial(), "Finished", "stop", []).success).toBe(
      true,
    );
  });
  it("fingerprints equivalent arguments deterministically", () => {
    expect(toolFingerprint("search", { a: 1, b: 2 })).toBe(
      toolFingerprint("search", { b: 2, a: 1 }),
    );
    expect(toolFingerprint("search", { a: 1 })).not.toBe(
      toolFingerprint("search", { a: 2 }),
    );
  });
});

describe("bounded execution context", () => {
  it("keeps tool calls and results paired while removing old conversation groups", () => {
    const bounded = boundModelContext(
      [
        { role: "user", content: "old context ".repeat(100) },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "one",
              toolName: "lookup",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "one",
              toolName: "lookup",
              output: { type: "text", value: "old result ".repeat(100) },
            },
          ],
        },
        { role: "user", content: "Current request" },
        { role: "assistant", content: "Current progress" },
      ],
      350,
    );
    expect(bounded.changed).toBe(true);
    expect(bounded.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(JSON.stringify(bounded.messages)).toContain("Current request");
  });
  it("abbreviates oversized results with a recovery pointer instead of losing their provenance", () => {
    const result = boundModelContext(
      [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "saved",
              toolName: "lookup",
              output: { type: "text", value: "x".repeat(20_000) },
            },
          ],
        },
      ],
      20_000,
    );
    expect(JSON.stringify(result.messages)).toContain("readExecutionEvidence");
    expect(JSON.stringify(result.messages)).toContain("saved");
    expect(JSON.stringify(result.messages).length).toBeLessThan(9000);
  });
});
