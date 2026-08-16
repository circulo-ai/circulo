import { describe, expect, expectTypeOf, it } from "vitest";
import {
  complete,
  defineWorkflow,
  error,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  waitFor,
  WorkflowEngine,
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
  });
});

describe("WorkflowEngine", () => {
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
