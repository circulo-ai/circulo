import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AdapterEventBus,
  complete,
  defineWorkflow,
  error,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  JsonEventStore,
  JsonWorkflowStore,
  MapJsonKeyValueStore,
  MapPubSubAdapter,
  MapWorkflowLockStore,
  waitFor,
  waitForAndRetry,
  WorkflowEngine,
  WorkflowHookManager,
  type Workflow,
} from "../src";

interface Context {
  attempts: number;
}

function createEngine<TInput, TOutput>() {
  return new WorkflowEngine<Context, TInput, TOutput>({
    workflowStore: new InMemoryWorkflowStore<Context, TInput, TOutput>(),
    eventStore: new InMemoryEventStore<TOutput>(),
    eventBus: new InMemoryEventBus<TOutput>(),
    enableAutoResume: false,
  });
}

describe("workflow DSL", () => {
  it("threads step input and output types through the builder", () => {
    const workflow = defineWorkflow<Context>()
      .context({ attempts: 0 })
      .step("first", {
        run: async (input: { value: number }) =>
          complete({ doubled: input.value * 2 }),
      })
      .step("second", {
        run: async (input: { doubled: number }) =>
          complete({ text: String(input.doubled) }),
      })
      .build();

    expectTypeOf(workflow).toMatchTypeOf<
      import("../src").WorkflowDefinition<
        Context,
        { value: number },
        { text: string }
      >
    >();
  });

  it("supports an explicitly supplied first input type for destructured handlers", () => {
    const workflow = defineWorkflow<Context, { value: number }>()
      .context({ attempts: 0 })
      .step("first", {
        run: async ({ value }) => complete(value * 2),
      })
      .build();

    expectTypeOf(workflow).toMatchTypeOf<
      import("../src").WorkflowDefinition<Context, { value: number }, number>
    >();
  });

  it("accepts falsy contexts and rejects invalid wait values", () => {
    const primitiveContextWorkflow = defineWorkflow<number>()
      .context(0)
      .step("run", {
        run: async () => complete(1),
      })
      .build();

    expect(primitiveContextWorkflow.initialContext).toBe(0);
    expect(() => waitFor(-1)).toThrow(RangeError);
    expect(() =>
      defineWorkflow<Context>()
        .context({ attempts: 0 })
        .step("", { run: async () => complete(1) }),
    ).toThrow("Step name must not be empty");
    expect(() =>
      defineWorkflow<Context>()
        .context({ attempts: 0 })
        .step("invalid", { retries: -1, run: async () => complete(1) }),
    ).toThrow(RangeError);
  });
});

describe("workflow lifecycle hooks", () => {
  it("supports priorities, wildcard listeners, one-shot listeners, and cleanup", async () => {
    const hooks = new WorkflowHookManager<void, void, string>();
    const calls: string[] = [];

    hooks.on(
      "workflow.started",
      () => {
        calls.push("normal");
      },
      {
        priority: 1,
      },
    );
    hooks.onAny(
      () => {
        calls.push("any");
      },
      { priority: -1 },
    );
    hooks.once("workflow.started", () => {
      calls.push("once");
    });

    await hooks.emit({ name: "workflow.started", timestamp: 1 });
    await hooks.emit({ name: "workflow.started", timestamp: 2 });

    expect(calls).toEqual(["normal", "once", "any", "normal", "any"]);
    expect(hooks.size).toBe(2);
    hooks.clear();
    expect(hooks.size).toBe(0);
  });

  it("isolates listener failures by default and reports them", async () => {
    const errors: string[] = [];
    const hooks = new WorkflowHookManager<void, void, void>({
      onError: (error, context) => {
        errors.push(`${context.name}:${String(error)}`);
      },
    });
    let completed = false;
    hooks.on("workflow.completed", () => {
      throw new Error("telemetry unavailable");
    });
    hooks.on("workflow.completed", () => {
      completed = true;
    });

    await hooks.emit({ name: "workflow.completed", timestamp: 1 });

    expect(completed).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("workflow.completed");
  });

  it("is available from the engine for backend integrations", async () => {
    const hooks = new WorkflowHookManager<Context, void, string>();
    const seen: string[] = [];
    hooks.onAny((context) => {
      seen.push(context.name);
    });
    const engine = new WorkflowEngine<Context, void, string>({
      workflowStore: new InMemoryWorkflowStore<Context, void, string>(),
      eventStore: new InMemoryEventStore<string>(),
      eventBus: new InMemoryEventBus<string>(),
      hooks,
      enableAutoResume: false,
    });
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("run", { run: async () => complete("ok") })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    await engine.run(id);

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(seen).toEqual([
      "engine.started",
      "workflow.created",
      "workflow.started",
      "workflow.step.started",
      "workflow.step.completed",
      "workflow.completed",
    ]);
    await engine.shutdown();
    expect(seen.at(-1)).toBe("engine.shutdown");
  });
});

describe("WorkflowEngine", () => {
  it("coalesces duplicate run requests for the same workflow", async () => {
    const engine = createEngine<void, string>();
    let executions = 0;
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("run-once", {
        run: async () => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return complete("done");
        },
      })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);

    await Promise.all([engine.run(id), engine.run(id), engine.run(id)]);

    expect(executions).toBe(1);
    expect((await engine.getWorkflow(id))?.output).toBe("done");
    await engine.shutdown();
  });

  it("returns the existing workflow for an idempotency key", async () => {
    const engine = createEngine<string, string>();
    const workflow = defineWorkflow<Context, string>()
      .context({ attempts: 0 })
      .idempotencyKey("request-1")
      .step("run", { run: async (input) => complete(input) })
      .build();

    const first = await engine.createWorkflow(workflow, "first");
    const second = await engine.createWorkflow(workflow, "second");

    expect(second).toBe(first);
    expect((await engine.getWorkflow(first))?.input).toBe("first");
    await engine.shutdown();
  });

  it("works with only the required stores and delivers events before run resolves", async () => {
    const engine = createEngine<{ value: number }, number>();
    const events: string[] = [];
    const workflow = defineWorkflow<Context, { value: number }>()
      .context({ attempts: 0 })
      .step("run", {
        run: async (input, ctx) => {
          ctx.updateContext({ attempts: ctx.data.attempts + 1 });
          return complete(input.value);
        },
      })
      .build();

    const id = await engine.createWorkflow(workflow, { value: 7 });
    engine.subscribe(id, (event) => {
      events.push(event.eventType);
    });

    await engine.run(id);

    const result = await engine.getWorkflow(id);
    expect(result?.state).toBe("completed");
    expect(result?.context.attempts).toBe(1);
    expect(result?.output).toBe(7);
    expect(events).toEqual([
      "workflow.started",
      "workflow.step.started",
      "workflow.step.completed",
      "workflow.completed",
    ]);

    await engine.shutdown();
  });

  it("creates and runs a workflow through the convenience API", async () => {
    const engine = new WorkflowEngine<void, string, string>({
      workflowStore: new InMemoryWorkflowStore<void, string, string>(),
      eventStore: new InMemoryEventStore<string>(),
      eventBus: new InMemoryEventBus<string>(),
      enableAutoResume: false,
    });
    const workflow = defineWorkflow<void, string>()
      .context(undefined)
      .step("run", { run: async (input) => complete(input.toUpperCase()) })
      .build();

    const id = await engine.createAndRun(workflow, "hello");
    expect((await engine.getWorkflow(id))?.output).toBe("HELLO");
    await engine.shutdown();
  });

  it("preserves explicit step errors and retries them", async () => {
    const engine = createEngine<void, string>();
    let attempts = 0;
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("retry", {
        retries: 1,
        backoff: () => 0,
        run: async () => {
          attempts += 1;
          return attempts === 1
            ? error("try again", "transient", true)
            : complete("done");
        },
      })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    await engine.run(id);

    expect(attempts).toBe(2);
    expect((await engine.getWorkflow(id))?.state).toBe("completed");
    await engine.shutdown();
  });

  it("waits and resumes from the next step", async () => {
    const engine = createEngine<void, string>();
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("pause", {
        run: async () => waitFor(60, "waiting"),
      })
      .step("finish", {
        run: async (input) => complete(`${input}!`),
      })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    await engine.run(id);
    expect((await engine.getWorkflow(id))?.state).toBe("paused");

    await new Promise((resolve) => setTimeout(resolve, 70));
    await engine.resumeDueWorkflows();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await engine.getWorkflow(id))?.state).toBe("completed");
    expect((await engine.getWorkflow(id))?.output).toBe("waiting!");
    await engine.shutdown();
  });

  it("can wait and rerun the same step for durable polling", async () => {
    const engine = createEngine<void, string>();
    let attempts = 0;
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("poll", {
        run: async () => {
          attempts += 1;
          return attempts === 1
            ? waitForAndRetry(20, "waiting")
            : complete("done");
        },
      })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    await engine.run(id);
    expect((await engine.getWorkflow(id))?.state).toBe("paused");
    expect((await engine.getWorkflow(id))?.currentStep).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 30));
    await engine.resumeDueWorkflows();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attempts).toBe(2);
    expect((await engine.getWorkflow(id))?.state).toBe("completed");
    expect((await engine.getWorkflow(id))?.output).toBe("done");
    await engine.shutdown();
  });

  it("does not strand a workflow when resume races with an active pause", async () => {
    const engine = createEngine<void, string>();
    let releaseStep!: () => void;
    const stepReleased = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("long-running", {
        run: async () => {
          await stepReleased;
          return complete("done");
        },
      })
      .build();

    const id = await engine.createWorkflow(workflow, undefined);
    const runPromise = engine.run(id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await engine.pause(id);
    await engine.resume(id);
    releaseStep();
    await runPromise;

    expect((await engine.getWorkflow(id))?.state).toBe("completed");
    await engine.shutdown();
  });

  it("runs queued workflows and resolves both run promises", async () => {
    const engine = new WorkflowEngine<Context, number, number>({
      workflowStore: new InMemoryWorkflowStore<Context, number, number>(),
      eventStore: new InMemoryEventStore<number>(),
      eventBus: new InMemoryEventBus<number>(),
      maxConcurrentWorkflows: 1,
      enableAutoResume: false,
    });
    const workflow = defineWorkflow<Context, number>()
      .context({ attempts: 0 })
      .step("run", {
        run: async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return complete(input + 1);
        },
      })
      .build();
    const first = await engine.createWorkflow(workflow, 1);
    const second = await engine.createWorkflow(workflow, 2);

    await Promise.all([engine.run(first), engine.run(second)]);

    expect((await engine.getWorkflow(first))?.output).toBe(2);
    expect((await engine.getWorkflow(second))?.output).toBe(3);
    await engine.shutdown();
  });

  it("marks a timed-out step as failed", async () => {
    const engine = createEngine<void, unknown>();
    const workflow = defineWorkflow<Context, void>()
      .context({ attempts: 0 })
      .step("timeout", {
        timeout: 10,
        run: async () => new Promise(() => undefined),
      })
      .build();
    const id = await engine.createWorkflow(workflow, undefined);

    await expect(engine.run(id)).rejects.toThrow("Step timeout");
    const result = await engine.getWorkflow(id);
    expect(result?.state).toBe("failed");
    expect(result?.error?.type).toBe("timeout");
    await engine.shutdown();
  });

  it("exposes the expected workflow shape to consumers", () => {
    expectTypeOf<Workflow<Context, number, string>["state"]>().toEqualTypeOf<
      "pending" | "running" | "paused" | "failed" | "completed"
    >();
  });
});

describe("durable adapter contracts", () => {
  it("persists workflow state through a JSON key/value adapter", async () => {
    const store = new MapJsonKeyValueStore();
    const locks = new MapWorkflowLockStore();
    const workflow = defineWorkflow<{ count: number }, { value: number }>()
      .context({ count: 0 })
      .step("increment", {
        run: async (input, ctx) => {
          ctx.updateContext({ count: input.value });
          return complete(input.value + 1);
        },
      })
      .build();
    const id = `wf-adapter-${Date.now()}`;
    const runtime = new JsonWorkflowStore(store, locks, () => workflow.steps);
    const persisted: Workflow<{ count: number }, { value: number }, number> = {
      id,
      version: 0,
      state: "pending",
      steps: workflow.steps,
      currentStep: 0,
      context: workflow.initialContext,
      input: { value: 4 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      tags: { adapter: "json" },
      metadata: {},
    };

    await runtime.saveWorkflow(persisted);
    const loaded = await runtime.loadWorkflow(id);
    expect(loaded?.steps).toHaveLength(1);
    expect(loaded?.input).toEqual({ value: 4 });

    loaded!.state = "completed";
    expect(await runtime.updateWorkflow(loaded!, 0)).toBe(true);
    expect((await runtime.loadWorkflow(id))?.version).toBe(1);
    expect(await runtime.updateWorkflow(loaded!, 0)).toBe(false);
  });

  it("provides append-only event persistence and pub/sub bridging", async () => {
    const store = new MapJsonKeyValueStore();
    const events = new JsonEventStore<number>(store);
    const bus = new AdapterEventBus(new MapPubSubAdapter<number>());
    const received: string[] = [];
    const unsubscribe = bus.subscribe("workflow-1", (event) => {
      received.push(event.eventType);
    });
    const event = {
      id: "event-1",
      workflowId: "workflow-1",
      timestamp: Date.now(),
      eventType: "workflow.completed" as const,
      payload: { type: "completed" as const, output: 42, duration: 1 },
    };

    await events.append(event);
    await bus.publish(event);

    expect(await events.count("workflow-1")).toBe(1);
    expect((await events.list("workflow-1"))[0]?.payload).toEqual(
      event.payload,
    );
    expect(received).toEqual(["workflow.completed"]);
    unsubscribe();
    await events.clear("workflow-1");
    expect(await events.count("workflow-1")).toBe(0);
  });
});
