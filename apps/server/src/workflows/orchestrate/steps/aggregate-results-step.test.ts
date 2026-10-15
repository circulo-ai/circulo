import { expect, it, vi } from "vitest";
import { aggregateResultsStep } from "./aggregate-results-step";
import type { AgentExecutionResult } from "./execute-agent-task-step";
vi.mock("@/db", () => ({ db: {}, humanApproval: {} }));
const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/provider-registry", () => ({
  resolveLanguageModel: resolve,
  getDefaultModelForProvider: () => "model",
}));

it("preserves one final response after successful MCP approval continuations", async () => {
  const base = {
    agentName: "Circulo",
    task: "Read docs",
    success: true,
    startTime: new Date(),
    endTime: new Date(),
    durationMs: 1,
  };
  const result = await aggregateResultsStep({
    userId: "user",
    agentResults: [
      { ...base, agentId: "mcp:context7", output: "Library metadata" },
      { ...base, agentId: "mcp:context7", output: "Documentation evidence" },
      {
        ...base,
        agentId: "circulo-default",
        output: "One final answer with sources",
      },
    ] as AgentExecutionResult[],
    plan: { strategy: "single" } as any,
    classification: { intent: "question" } as any,
    triggerMessages: [],
  });
  expect(result.detailedResponse).toBe("One final answer with sources");
  expect(result.overallSuccess).toBe(true);
  expect(resolve).not.toHaveBeenCalled();
});
