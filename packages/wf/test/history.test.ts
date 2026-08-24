import { describe, expect, it } from "vitest";
import { InMemoryWorkflowHistoryStore } from "../src";

describe("workflow history", () => {
  it("appends sequence-numbered events atomically", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const first = await history.append(
      {
        workflowId: "workflow-1",
        runId: "run-1",
        eventType: "workflow.started",
        payload: { input: "hello" },
      },
      0,
    );
    const stale = await history.append(
      {
        workflowId: "workflow-1",
        runId: "run-1",
        eventType: "workflow.completed",
        payload: { output: "world" },
      },
      0,
    );
    const second = await history.appendBatch(
      [
        {
          workflowId: "workflow-1",
          runId: "run-1",
          eventType: "activity.scheduled",
          payload: { activity: "send" },
        },
        {
          workflowId: "workflow-1",
          runId: "run-1",
          eventType: "activity.completed",
          payload: { result: true },
        },
      ],
      1,
    );

    expect(first?.nextSequence).toBe(1);
    expect(stale).toBeNull();
    expect(second?.nextSequence).toBe(3);
    expect(await history.nextSequence("workflow-1", "run-1")).toBe(3);

    const events = await history.read<{ activity?: string }>({
      workflowId: "workflow-1",
      runId: "run-1",
    });
    expect(events.map((event) => [event.sequence, event.eventType])).toEqual([
      [0, "workflow.started"],
      [1, "activity.scheduled"],
      [2, "activity.completed"],
    ]);
  });

  it("reads a run by sequence instead of wall-clock timestamp", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    await history.append(
      {
        workflowId: "workflow-order",
        runId: "run-1",
        eventType: "workflow.started",
        payload: {},
        timestamp: 20,
      },
      0,
    );
    await history.append(
      {
        workflowId: "workflow-order",
        runId: "run-1",
        eventType: "workflow.completed",
        payload: {},
        timestamp: 10,
      },
      1,
    );
    const events = await history.read({
      workflowId: "workflow-order",
      runId: "run-1",
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "workflow.started",
      "workflow.completed",
    ]);
  });

  it("clones payloads and clears one run without clearing siblings", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const payload = { nested: { value: 1 } };
    await history.append(
      {
        workflowId: "workflow-2",
        runId: "run-a",
        eventType: "signal.received",
        payload,
      },
      0,
    );
    await history.append(
      {
        workflowId: "workflow-2",
        runId: "run-b",
        eventType: "workflow.started",
        payload: {},
      },
      0,
    );

    payload.nested.value = 2;
    const loaded = await history.read<{ nested?: { value: number } }>({
      workflowId: "workflow-2",
      runId: "run-a",
    });
    expect(loaded[0]?.payload).toEqual({ nested: { value: 1 } });

    await history.clear("workflow-2", "run-a");
    expect(await history.nextSequence("workflow-2", "run-a")).toBe(0);
    expect(await history.nextSequence("workflow-2", "run-b")).toBe(1);
  });
});
