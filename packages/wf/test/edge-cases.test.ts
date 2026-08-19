import { describe, expect, it } from "vitest";
import {
  chunk,
  complete,
  defineWorkflow,
  error,
  exponentialBackoff,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  MapJsonKeyValueStore,
  MapPubSubAdapter,
  MapWorkflowLockStore,
  AdapterEventBus,
  JsonEventStore,
  JsonWorkflowStore,
  streamStep,
  waitFor,
  WorkflowEngine,
  WorkflowHookManager,
  type Workflow,
  type StepResult,
} from "../src";

interface Context {
  count: number;
  nested?: { value: string };
}

function createEngine<TInput, TOutput>(
  options: Partial<ConstructorParameters<typeof WorkflowEngine<Context, TInput, TOutput>>[0]> = {},
): WorkflowEngine<Context, TInput, TOutput> {
  return new WorkflowEngine<Context, TInput, TOutput>({
    workflowStore: new InMemoryWorkflowStore<Context, TInput, TOutput>(),
    eventStore: new InMemoryEventStore<TOutput>(),
    eventBus: new InMemoryEventBus<TOutput>(),
    enableAutoResume: false,
    ...options,
  });
}

describe("DSL and utility edge cases", () => {
  it("requires a context and at least one step", () => {
    expect(() => defineWorkflow<Context>().build()).toThrow(
      "Initial context must be set",
    );
    expect(() =>
      defineWorkflow<Context>().context({ count: 0 }).build(),
    ).toThrow("at least one step");
  });

  it("rejects invalid definition and helper configuration", () => {
    expect(() => defineWorkflow<Context>().name(" ")).toThrow();
    expect(() => defineWorkflow<Context>().version(0)).toThrow(RangeError);
    expect(() => exponentialBackoff(-1)).toThrow(RangeError);
    expect(() => exponentialBackoff(1, 2, 1)).toThrow(RangeError);
    expect(() => waitFor(Number.NaN)).toThrow(RangeError);
  });

  it("rejects an empty streaming collection when consumed", async () => {
    const generator = streamStep([]);
    await expect(generator.next()).rejects.toThrow("at least one item");
  });

  it("clones initial context at creation time", async () => {
    const initial = { count: 1, nested: { value: "before" } };
    const engine = createEngine<void, number>();
    const workflow = defineWorkflow<Context, void>()
      .context(initial)
      .step("read", { run: async (_, ctx) => complete(ctx.data.count) })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    initial.count = 99;
    initial.nested.value = "after";

    expect((await engine.getWorkflow(id))?.context).toEqual({
      count: 1,
      nested: { value: "before" },
    });
    await engine.shutdown();
  });
});

describe("engine failure and lifecycle edges", () => {
  it("does not persist invalid input", async () => {
    const engine = createEngine<number, number>();
    const workflow = defineWorkflow<Context, number>()
      .context({ count: 0 })
      .validate((input) => input > 0)
      .step("run", { run: async (input) => complete(input) })
      .build();

    await expect(engine.createWorkflow(workflow, 0)).rejects.toThrow(
      "validation failed",
    );
    expect(await engine.listWorkflows()).toHaveLength(0);
    await engine.shutdown();
  });

  it("rejects missing workflows and ignores repeated terminal runs", async () => {
    const engine = createEngine<void, string>();
    await expect(engine.run("missing")).rejects.toThrow("not found");
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("done") })
      .build();
    const id = await engine.createAndRun(workflow, undefined);

    await engine.run(id);
    expect((await engine.getWorkflow(id))?.state).toBe("completed");
    await engine.shutdown();
  });

  it("keeps completed workflows completed when abort is called", async () => {
    const engine = createEngine<void, string>();
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("done") })
      .build();
    const id = await engine.createAndRun(workflow, undefined);

    await engine.abort(id, "too late");

    const result = await engine.getWorkflow(id);
    expect(result?.state).toBe("completed");
    expect(result?.error).toBeUndefined();
    await engine.shutdown();
  });

  it("applies output transforms and fails durably when a transform throws", async () => {
    const engine = createEngine<void, string>();
    const successful = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("ok") })
      .transform((output) => output.toUpperCase())
      .build();
    const id = await engine.createAndRun(successful, undefined);
    expect((await engine.getWorkflow(id))?.output).toBe("OK");

    const failing = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("value") })
      .transform(() => {
        throw new Error("transform failed");
      })
      .build();
    const failingId = await engine.createWorkflow(failing, undefined);
    await expect(engine.run(failingId)).rejects.toThrow("transform failed");
    expect((await engine.getWorkflow(failingId))?.state).toBe("failed");
    await engine.shutdown();
  });

  it("runs compensations after a later step fails", async () => {
    const engine = createEngine<void, string>();
    let compensated = false;
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("first", { run: async () => complete("first") })
      .step("second", {
        run: async (): Promise<StepResult<string>> =>
          error("permanent failure", "permanent"),
        compensation: async () => {
          compensated = true;
        },
      })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);

    await expect(engine.run(id)).rejects.toThrow("permanent failure");
    expect(compensated).toBe(true);
    await engine.shutdown();
  });

  it("aborts a running workflow and persists the abort reason", async () => {
    const engine = createEngine<void, string>();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("wait", {
        run: async (_, ctx) => {
          await new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
            started();
            if (ctx.signal.aborted) resolve();
          });
          return complete("unreachable");
        },
      })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);
    const runPromise = engine.run(id);
    await startedPromise;

    await engine.abort(id, "request cancelled", "permanent");
    await runPromise;

    const result = await engine.getWorkflow(id);
    expect(result?.state).toBe("failed");
    expect(result?.error?.message).toBe("request cancelled");
    await engine.shutdown();
  });

  it("emits streaming chunks and keeps only the completed value as output", async () => {
    const engine = createEngine<void, number>();
    const events: number[] = [];
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("stream", {
        run: async function* () {
          yield chunk(1);
          yield chunk(2);
          return complete(3);
        },
      })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);
    engine.subscribe(id, (event) => {
      if (event.payload.type === "step.yielded") {
        events.push(event.payload.data);
      }
    });

    await engine.run(id);

    expect(events).toEqual([1, 2]);
    expect((await engine.getWorkflow(id))?.output).toBe(3);
    await engine.shutdown();
  });

  it("supports dynamic step insertion after the current step", async () => {
    const engine = createEngine<void, string>();
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("plan", {
        run: async (_, ctx) => {
          ctx.appendSteps([
            {
              id: "dynamic-step",
              name: "dynamic-step",
              run: async (input) => complete(`${String(input)}-dynamic`),
            },
          ]);
          return complete("planned");
        },
      })
      .step("finish", {
        run: async (input) => complete(`${input}-finish`),
      })
      .build();
    const id = await engine.createAndRun(workflow, undefined);

    expect((await engine.getWorkflow(id))?.output).toBe("planned-dynamic-finish");
    expect((await engine.getWorkflow(id))?.steps).toHaveLength(3);
    await engine.shutdown();
  });

  it("classifies thrown transient errors and retries them", async () => {
    const engine = createEngine<void, string>();
    let attempts = 0;
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("retry", {
        retries: 1,
        backoff: () => 0,
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("network unavailable");
          return complete("recovered");
        },
      })
      .build();
    const id = await engine.createAndRun(workflow, undefined);

    expect(attempts).toBe(2);
    expect((await engine.getWorkflow(id))?.output).toBe("recovered");
    await engine.shutdown();
  });

  it("fails between steps when the workflow execution deadline is exceeded", async () => {
    const engine = createEngine<void, string>();
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .maxExecutionTime(1)
      .step("slow", {
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return complete("slow");
        },
      })
      .step("never", { run: async () => complete("never") })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);

    await engine.run(id);

    const result = await engine.getWorkflow(id);
    expect(result?.state).toBe("failed");
    expect(result?.error?.type).toBe("timeout");
    await engine.shutdown();
  });
});

describe("health, filters, and shutdown", () => {
  it("filters workflows and reports failed health counts", async () => {
    const engine = createEngine<void, string>();
    const successful = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .tags({ team: "platform", env: "test" })
      .step("run", { run: async () => complete("ok") })
      .build();
    const failing = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .tags({ team: "payments" })
      .step("fail", {
        run: async (): Promise<StepResult<string>> =>
          error("boom", "permanent"),
      })
      .build();
    const successId = await engine.createAndRun(successful, undefined);
    const failId = await engine.createWorkflow(failing, undefined);
    await expect(engine.run(failId)).rejects.toThrow("boom");

    expect(
      await engine.listWorkflows({ tags: { team: "platform" } }),
    ).toHaveLength(1);
    expect(
      await engine.listWorkflows({ state: "failed", limit: 1 }),
    ).toEqual([expect.objectContaining({ id: failId })]);
    expect((await engine.getHealth()).details.failedWorkflows).toBe(1);
    expect((await engine.getWorkflow(successId))?.state).toBe("completed");
    await engine.shutdown();
  });

  it("makes shutdown idempotent and rejects new work", async () => {
    const engine = createEngine<void, string>();
    await engine.shutdown();
    await engine.shutdown();
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("done") })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);

    await expect(engine.run(id)).rejects.toThrow("shutting down");
  });
});

describe("hook manager and in-memory stores", () => {
  it("supports fail-fast hooks and disposal", async () => {
    const reported: string[] = [];
    const hooks = new WorkflowHookManager<void, void, void>({
      failFast: true,
      onError: (error) => {
        reported.push(String(error));
      },
    });
    hooks.on("workflow.completed", () => {
      throw new Error("hook failed");
    });

    await expect(
      hooks.emit({ name: "workflow.completed", timestamp: 1 }),
    ).rejects.toThrow("hook failed");
    expect(reported).toEqual(["Error: hook failed"]);

    hooks.dispose();
    await expect(
      hooks.emit({ name: "workflow.completed", timestamp: 2 }),
    ).resolves.toBeUndefined();
  });

  it("prunes and clones in-memory events", async () => {
    const events = new InMemoryEventStore<number>(2);
    const event = (id: string, timestamp: number) => ({
      id,
      workflowId: "wf",
      timestamp,
      eventType: "workflow.step.yielded" as const,
      payload: { type: "step.yielded" as const, stepId: "step", data: timestamp },
    });
    await events.append(event("one", 1));
    await events.append(event("two", 2));
    await events.append(event("three", 3));

    const loaded = await events.list("wf");
    expect(loaded.map((item) => item.id)).toEqual(["two", "three"]);
    if (loaded[0]?.payload.type !== "step.yielded") {
      throw new Error("Expected a yielded event");
    }
    loaded[0].payload.data = 999;
    const reloaded = await events.list("wf");
    expect(reloaded[0]?.payload.type).toBe("step.yielded");
    if (reloaded[0]?.payload.type === "step.yielded") {
      expect(reloaded[0].payload.data).toBe(2);
    }
  });
});

describe("durable adapter edge cases", () => {
  it("enforces compare-and-set and exclusive lock ownership", async () => {
    const store = new MapJsonKeyValueStore();
    await store.set("key", { version: 0, value: "initial" });
    expect(await store.compareAndSet("key", 1, { version: 2 })).toBe(false);
    expect(await store.compareAndSet("key", 0, { version: 1 })).toBe(true);

    const locks = new MapWorkflowLockStore();
    const first = await locks.acquireLock("wf", 1000, "first");
    expect(first).not.toBeNull();
    expect(await locks.acquireLock("wf", 1000, "second")).toBeNull();
    expect(await locks.renewLock(first!, 1000)).toBe(true);
    await locks.releaseLock(first!);
    expect(await locks.acquireLock("wf", 1000, "second")).not.toBeNull();
  });

  it("orders JSON events and rebuilds workflow steps", async () => {
    const store = new MapJsonKeyValueStore();
    const locks = new MapWorkflowLockStore();
    const workflow = defineWorkflow<Context, void>()
      .context({ count: 0 })
      .step("run", { run: async () => complete("ok") })
      .build();
    const runtime = new JsonWorkflowStore(
      store,
      locks,
      () => workflow.steps,
      { keyPrefix: "test:wf:" },
    );
    const persisted: Workflow<Context, void, string> = {
      id: "workflow-1",
      version: 0,
      state: "pending",
      steps: workflow.steps,
      currentStep: 0,
      context: { count: 0 },
      input: undefined,
      createdAt: 10,
      updatedAt: 10,
      retryCount: 0,
      tags: {},
      metadata: {},
    };
    await runtime.saveWorkflow(persisted);
    const loaded = await runtime.loadWorkflow(persisted.id);
    expect(loaded?.steps[0]?.name).toBe("run");

    const eventStore = new JsonEventStore<number>(store, "test:event:");
    await eventStore.append({
      id: "late",
      workflowId: "workflow-1",
      timestamp: 20,
      eventType: "workflow.completed",
      payload: { type: "completed", output: 2, duration: 1 },
    });
    await eventStore.append({
      id: "early",
      workflowId: "workflow-1",
      timestamp: 10,
      eventType: "workflow.started",
      payload: { type: "started", workflowId: "workflow-1", version: 0 },
    });
    expect((await eventStore.list("workflow-1")).map((event) => event.id)).toEqual([
      "early",
      "late",
    ]);
    expect((await eventStore.list("workflow-1", 20)).map((event) => event.id)).toEqual([
      "late",
    ]);
  });

  it("delivers pub/sub callbacks and allows unsubscribe", async () => {
    const bus = new AdapterEventBus(new MapPubSubAdapter<number>());
    const received: number[] = [];
    const unsubscribe = bus.subscribeAll((event) => {
      if (event.payload.type === "completed") {
        received.push(event.payload.output);
      }
    });
    const event = {
      id: "event",
      workflowId: "wf",
      timestamp: 1,
      eventType: "workflow.completed" as const,
      payload: { type: "completed" as const, output: 1, duration: 0 },
    };
    await bus.publish(event);
    unsubscribe();
    await bus.publish({ ...event, id: "event-2", payload: { ...event.payload, output: 2 } });

    expect(received).toEqual([1]);
  });
});
