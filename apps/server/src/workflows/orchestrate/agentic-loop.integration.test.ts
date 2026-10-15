import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ evaluations: 0, executions: 0, completeAt: Infinity, persisted: new Map<string, unknown>() }));
vi.mock("@/db", () => ({ db: {}, workflowRunEvent: {}, humanApproval: {}, mcpIntegration: {}, taskHandoff: {} }));
vi.mock("@/workflows/orchestrate/agent-loop-state", async importOriginal => {
  const actual = await importOriginal<typeof import("./agent-loop-state")>();
  return { ...actual, persistDurableAgentLoopSnapshot: async () => {}, loadDurableAgentLoopSnapshots: async () => [] };
});
vi.mock("@/workflows/orchestrate/steps/evaluate-agent-progress-step", () => ({
  loadDurableAgentProgressDecisions: async () => new Map(),
  persistDurableAgentProgressDecision: async (_id: string, _iteration: number, decision: unknown) => decision,
  evaluateAgentProgressStep: async () => {
    const iteration = ++fixture.evaluations;
    return iteration >= fixture.completeAt ? { decision: "complete", reasoning: "All requirements verified", nextSteps: [] } : { decision: "continue", reasoning: "A distinct requirement remains", nextSteps: [{ agentId: "agent", task: `Verify requirement ${iteration + 1}`, reason: "Additional check", priority: "high" }] };
  },
}));
vi.mock("@/workflows/orchestrate/steps/execute-agent-task-step", () => ({
  toUIMessageStreamWriter: () => ({ write: () => {} }),
  flushDurableUIChunks: async () => {},
  getAgentExecutionKey: (plan: { agentId: string; order: number; task: string }) => `${plan.agentId}:${plan.order}:${plan.task}`,
  persistDurableAgentResult: async (_id: string, key: string, result: unknown) => { fixture.persisted.set(key, result); },
  loadDurableAgentResults: async () => fixture.persisted,
  executeDirectResponseStep: async () => { throw new Error("Not used by this scenario"); },
  executeAgentTaskStep: async ({ agentPlan }: { agentPlan: { agentId: string; task: string } }) => {
    fixture.executions++;
    return { agentId: agentPlan.agentId, agentName: "Verification agent", task: agentPlan.task, success: true, output: "Verified requirement", startTime: new Date(), endTime: new Date(), durationMs: 1 };
  },
}));
import { executeAgenticLoop } from "./orchestrate";
const params = () => ({ actor: { userId: "user", organizationId: "organization" }, plan: { strategy: "sequential" as const, reasoning: "Verify requested requirements", stopOnError: true, selectedAgents: [{ agentId: "agent", order: 0, parallelGroup: null, dependsOn: null, reason: "Initial check", task: "Verify requirement 1", estimatedDuration: null, priority: "high" as const }], fallbackAgentId: null, timeoutMinutes: 10 }, context: { agents: [{ agentId: "agent", isEnabled: true, agent: { id: "agent", name: "Verification agent" } }] } as never, workflowId: "workflow", durableAgentResults: new Map(), triggerMessages: [], classification: {} as never, startedAt: Date.now() });
beforeEach(() => { fixture.evaluations = 0; fixture.executions = 0; fixture.completeAt = Infinity; fixture.persisted.clear(); });
describe("outer agentic loop completion and recovery", () => {
  it("does not report completion when the controller still requests work at the last iteration", async () => {
    const result = await executeAgenticLoop(params());
    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(4);
    expect(fixture.evaluations).toBe(4);
    expect(result.reason).toContain("before the goal was verified complete");
  });
  it("evaluates the final allowed iteration and accepts an explicitly verified goal", async () => {
    fixture.completeAt = 4;
    const result = await executeAgenticLoop(params());
    expect(result.status).toBe("completed");
    expect(fixture.evaluations).toBe(4);
    expect(fixture.executions).toBe(4);
  });
  it("does not start actions after the time budget expires", async () => {
    const result = await executeAgenticLoop({ ...params(), startedAt: Date.now() - 60 * 60_000 });
    expect(result.status).toBe("blocked");
    expect(fixture.executions).toBe(0);
  });
  it("reuses durable agent outcomes when the parent step is recovered", async () => {
    fixture.completeAt = 1;
    await executeAgenticLoop(params());
    const executions = fixture.executions;
    await executeAgenticLoop({ ...params(), durableAgentResults: fixture.persisted as never });
    expect(fixture.executions).toBe(executions);
  });
});
