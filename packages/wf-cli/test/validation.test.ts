import { describe, expect, it } from "vitest";
import { InMemoryWorkflowStepRegistry, loadWorkflowDefinition } from "@circulo-ai/wf";

const registry = new InMemoryWorkflowStepRegistry();
registry.register("step", () => ({ execute: async () => "done" }));

function document(steps: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ id: "Test", version: 1, steps });
}

describe("definition safety surfaced by the CLI loader", () => {
  it("rejects unknown step types before compilation", () => {
    expect(() => loadWorkflowDefinition(document([{ id: "a", stepType: "not-registered" }]), { registry }))
      .toThrow("Unknown workflow step type");
  });

  it("rejects duplicate ids, missing targets, cycles, and unreachable steps", () => {
    expect(() => loadWorkflowDefinition(document([
      { id: "a", stepType: "step" },
      { id: "a", stepType: "step" },
    ]), { registry })).toThrow("Duplicate");
    expect(() => loadWorkflowDefinition(document([
      { id: "a", stepType: "step", nextStepId: "missing" },
    ]), { registry })).toThrow("missing nextStepId");
    expect(() => loadWorkflowDefinition(document([
      { id: "a", stepType: "step", nextStepId: "b" },
      { id: "b", stepType: "step", nextStepId: "a" },
    ]), { registry })).toThrow("exactly one start");
    expect(() => loadWorkflowDefinition(document([
      { id: "a", stepType: "step" },
      { id: "b", stepType: "step" },
    ]), { registry })).toThrow("exactly one start");
  });
});
