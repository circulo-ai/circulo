import { describe, expect, expectTypeOf, it } from "vitest";
import {
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStepRegistry,
  InMemoryWorkflowStore,
  WorkflowEngine,
  WorkflowErrorHandling,
  compileClassReplayWorkflow,
  compileClassWorkflow,
  loadWorkflowDefinition,
  type IWorkflow,
  type IWorkflowStep,
  type WorkflowStepContext,
} from "../src";

interface Data {
  log: string[];
}

const sagaLog: string[] = [];

class AddOne implements IWorkflowStep<Data, number> {
  async execute(context: WorkflowStepContext<Data>): Promise<number> {
    return Number(context.input) + 1;
  }
}

class Double implements IWorkflowStep<Data, number> {
  async execute(context: WorkflowStepContext<Data>): Promise<number> {
    return Number(context.input) * 2;
  }
}

class Forward implements IWorkflowStep<Data, number> {
  async execute(context: WorkflowStepContext<Data>): Promise<number> {
    sagaLog.push("forward");
    return Number(context.input) + 1;
  }
}

class Undo implements IWorkflowStep<Data, unknown> {
  async execute(_context: WorkflowStepContext<Data>): Promise<unknown> {
    sagaLog.push("undo");
    return undefined;
  }
}

class Fails implements IWorkflowStep<Data, never> {
  async execute(_context: WorkflowStepContext<Data>): Promise<never> {
    throw new Error("failure");
  }
}

class ClassWorkflow implements IWorkflow<Data> {
  readonly id = "class-workflow";
  readonly version = 2;

  build(builder: import("../src").IWorkflowBuilder<Data>): void {
    builder
      .context({ log: [] })
      .startWith(AddOne)
      .then(Double)
      .onError(WorkflowErrorHandling.Retry, { maxAttempts: 2, delayMs: 0 });
  }
}

function registry(): InMemoryWorkflowStepRegistry {
  const result = new InMemoryWorkflowStepRegistry();
  result.register(AddOne, () => new AddOne(), "AddOne");
  result.register(Double, () => new Double(), "Double");
  result.register(Forward, () => new Forward(), "Forward");
  result.register(Undo, () => new Undo(), "Undo");
  result.register(Fails, () => new Fails(), "Fails");
  return result;
}

function engine<TInput, TOutput>(
  _context: Data = { log: [] },
): WorkflowEngine<Data, TInput, TOutput> {
  return new WorkflowEngine({
    workflowStore: new InMemoryWorkflowStore<Data, TInput, TOutput>(),
    eventStore: new InMemoryEventStore<TOutput>(),
    eventBus: new InMemoryEventBus<TOutput>(),
    enableAutoResume: false,
  });
}

describe("class and declarative workflow definitions", () => {
  it("infers class workflow output and creates fresh DI instances", async () => {
    const steps = registry();
    const definition = compileClassWorkflow(new ClassWorkflow(), {
      registry: steps,
    });
    expectTypeOf(definition).toMatchTypeOf<
      import("../src").WorkflowDefinition<Data, unknown, unknown>
    >();
    const wf = engine<unknown, unknown>();
    const id = await wf.createAndRun(definition, 2);
    expect((await wf.getWorkflow(id))?.output).toBe(6);
    expect((await wf.getWorkflow(id))?.definitionVersion).toBe(2);
    await wf.shutdown();

    expect(steps.create(AddOne)).not.toBe(steps.create(AddOne));
  });

  it("loads JSON through an allowlisted registry and validates the linear chain", () => {
    const definition = loadWorkflowDefinition<Data>(
      JSON.stringify({
        id: "json-workflow",
        version: 1,
        steps: [
          { id: "bye", stepType: "Double" },
          {
            id: "hello",
            stepType: "AddOne",
            nextStepId: "bye",
            retry: { maxAttempts: 3, delayMs: 10 },
          },
        ],
      }),
      { registry: registry(), initialContext: { log: [] } },
    );
    expect(definition.name).toBe("json-workflow");
    expect(definition.steps.map((step) => step.id)).toEqual(["hello", "bye"]);
    expect(definition.steps[0]?.retries).toBe(2);
    expect(() =>
      loadWorkflowDefinition(
        '{"id":"x","version":1,"steps":[{"id":"a","stepType":"Nope"}]}',
        {
          registry: registry(),
        },
      ),
    ).toThrow("Unknown workflow step type");
    expect(() =>
      loadWorkflowDefinition(
        '{"id":"x","version":1,"steps":[{"id":"a","stepType":"AddOne","nextStepId":"missing"}]}',
        {
          registry: registry(),
        },
      ),
    ).toThrow("missing nextStepId");
    expect(() =>
      loadWorkflowDefinition(
        '{"id":"x","version":1,"steps":[{"id":"a","stepType":"AddOne"},{"id":"a","stepType":"Double"}]}',
        { registry: registry() },
      ),
    ).toThrow("Duplicate workflow step id");
    expect(() =>
      loadWorkflowDefinition(
        '{"id":"x","version":1,"steps":[{"id":"a","stepType":"AddOne","nextStepId":"b"},{"id":"b","stepType":"Double","nextStepId":"a"}]}',
        { registry: registry() },
      ),
    ).toThrow("start step");
    expect(() =>
      loadWorkflowDefinition(
        '{"id":"x","version":1,"steps":[{"id":"a","stepType":"AddOne","nextStepId":"c"},{"id":"b","stepType":"Double","nextStepId":"c"},{"id":"c","stepType":"Double"}]}',
        { registry: registry() },
      ),
    ).toThrow("multiple predecessors");
  });

  it("requires an explicit YAML parser and supports injected optional parsers", () => {
    const document = "";
    expect(() =>
      loadWorkflowDefinition(document || "id: x", {
        format: "yaml",
        registry: registry(),
      }),
    ).toThrow('optional "yaml" dependency');
    const definition = loadWorkflowDefinition<Data>("ignored", {
      format: "yaml",
      registry: registry(),
      parser: {
        parse: () => ({
          id: "yaml-workflow",
          version: 1,
          steps: [{ id: "only", stepType: "AddOne" }],
        }),
      },
      initialContext: { log: [] },
    });
    expect(definition.name).toBe("yaml-workflow");
  });

  it("compensates class sagas in reverse completion order", async () => {
    const data: Data = { log: [] };
    sagaLog.length = 0;
    const steps = registry();
    class SagaWorkflow implements IWorkflow<Data> {
      id = "saga";
      version = 1;
      build(builder: import("../src").IWorkflowBuilder<Data>): void {
        builder
          .context(data)
          .saga((saga) =>
            saga
              .startWith(Forward)
              .compensateWith(Undo)
              .then(Forward)
              .compensateWith(Undo)
              .then(Fails),
          )
          .onError(WorkflowErrorHandling.Fail);
      }
    }
    const wf = engine<unknown, unknown>(data);
    const id = await wf.createWorkflow(
      compileClassWorkflow(new SagaWorkflow(), { registry: steps }),
      undefined,
    );
    await expect(wf.run(id)).rejects.toThrow("failure");
    expect(sagaLog).toEqual(["forward", "forward", "undo", "undo"]);
    await wf.shutdown();
  });

  it("compiles class steps to versioned replay activities", () => {
    const compiled = compileClassReplayWorkflow(new ClassWorkflow(), {
      registry: registry(),
    });
    expect(compiled.activityRegistry.get("AddOne", 2)).toBeDefined();
    expect(compiled.activityRegistry.get("Double", 2)).toBeDefined();
  });
});
