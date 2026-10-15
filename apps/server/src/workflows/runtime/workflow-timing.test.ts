import {
  calculateWorkflowTiming,
  type WorkflowTimingEvent,
} from "@circulo-ai/types";
import { expect, it } from "vitest";

const event = (
  id: string,
  eventType: string,
  timestamp: number,
  stepId?: string,
  durationMs?: number,
): WorkflowTimingEvent => ({ id, eventType, timestamp, stepId, durationMs });
it("excludes an overnight approval wait, stops at failure, and remains stable on replay", () => {
  const events = [
    event("start", "workflow.started", 1000),
    event("s1", "workflow.step.started", 1000, "agent"),
    event("e1", "workflow.step.completed", 4000, "agent", 3000),
    event("wait", "workflow.waiting", 4000),
    event("fail", "workflow.failed", 68263100),
  ];
  const expected = {
    activeTimeMs: 3000,
    idleTimeMs: 68259100,
    elapsedTimeMs: 68262100,
    sampledAtMs: 68263100,
    isActive: false,
  };
  expect(calculateWorkflowTiming(events, 999999999)).toEqual(expected);
  expect(calculateWorkflowTiming([...events, ...events], 999999999)).toEqual(
    expected,
  );
});
it("accumulates multiple approval continuations without counting waiting gaps", () => {
  const events = [
    event("start", "workflow.started", 1000),
    event("s1", "workflow.step.started", 1000, "step"),
    event("e1", "workflow.step.completed", 3000, "step", 2000),
    event("wait", "workflow.waiting", 3000),
    event("s2", "workflow.step.started", 13000, "step"),
    event("e2", "workflow.step.completed", 15000, "step", 2000),
    event("wait2", "workflow.waiting", 15000),
    event("s3", "workflow.step.started", 25000, "step"),
  ];
  expect(calculateWorkflowTiming(events, 26000)).toMatchObject({
    activeTimeMs: 5000,
    idleTimeMs: 20000,
    elapsedTimeMs: 25000,
    isActive: true,
  });
});
it("unions overlapping intervals, tolerates missing or invalid durations, and clamps clock changes", () => {
  const events = [
    event("start", "workflow.started", 1000),
    event("a", "workflow.step.started", 1000, "a"),
    event("b", "workflow.step.started", 2000, "b"),
    event("a-end", "workflow.step.completed", 4000, "a", NaN),
    event("b-end", "workflow.step.completed", 5000, "b", 3000),
    event("done", "workflow.completed", 5000),
  ];
  expect(calculateWorkflowTiming(events, 9000)).toMatchObject({
    activeTimeMs: 4000,
    idleTimeMs: 0,
    elapsedTimeMs: 4000,
    isActive: false,
  });
  expect(calculateWorkflowTiming(events.slice(0, 2), 0)?.activeTimeMs).toBe(0);
  expect(calculateWorkflowTiming([], 9000)).toBeUndefined();
});

it("counts failed attempts as active work and retry backoff as idle", () => {
  const events = [
    event("start", "workflow.started", 1000),
    event("attempt1", "workflow.step.started", 1000, "step"),
    event("retry", "workflow.retrying", 3000, "step"),
    event("attempt2", "workflow.step.started", 13000, "step"),
    event("end", "workflow.step.completed", 15000, "step", 2000),
    event("done", "workflow.completed", 15000),
  ];
  expect(calculateWorkflowTiming(events, 99999)).toMatchObject({
    activeTimeMs: 4000,
    idleTimeMs: 10000,
    elapsedTimeMs: 14000,
    isActive: false,
  });
});
