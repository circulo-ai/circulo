# @circulo-ai/wf

A production-quality, framework-agnostic TypeScript workflow orchestration runtime with event-sourced execution, streaming capabilities, and a strongly-typed declarative DSL.

## Features

- ✅ **Durable Execution**: Event-sourced state machine with full persistence
- ✅ **Streaming Steps**: Support for async generators with real-time progress
- ✅ **Pause/Resume**: Crash-safe workflow resumption from any point
- ✅ **Strong Typing**: End-to-end type safety with zero `any` types
- ✅ **Framework Agnostic**: Runs in Node, Bun, and Deno
- ✅ **Retry & Backoff**: Built-in resilience with configurable retry logic
- ✅ **Dynamic Replanning**: Steps can append new steps at runtime
- ✅ **Event Sourcing**: Complete audit trail of all workflow events
- ✅ **Pub/Sub Events**: Real-time workflow event subscriptions
- ✅ **Adapter Ready**: JSON workflow/event stores and external pub/sub bridges
- ✅ **Cancellation Aware**: Every step receives an `AbortSignal`
- ✅ **Atomic Updates**: Optimistic concurrency prevents duplicate workers
- ✅ **Lifecycle Safe**: Timers, locks, queued work, and shutdown are managed explicitly

## Installation

```bash
npm install @circulo-ai/wf
# or
bun add @circulo-ai/wf
# or
deno add @circulo-ai/wf
```

## Quick Start

```typescript
import {
  WorkflowEngine,
  defineWorkflow,
  complete,
  chunk,
  InMemoryWorkflowStore,
  InMemoryEventStore,
  InMemoryEventBus,
} from "@circulo-ai/wf";

// Define your context type
interface MyContext {
  count: number;
  messages: string[];
}

// Create workflow stores
const engine = new WorkflowEngine({
  workflowStore: new InMemoryWorkflowStore(),
  eventStore: new InMemoryEventStore(),
  eventBus: new InMemoryEventBus(),
});

// Define a workflow using the typed DSL
// Input type can be inferred from the first step, or specified up front:
// defineWorkflow<MyContext, { initial: number }>()
const workflow = defineWorkflow<MyContext, { initial: number }>()
  .context({ count: 0, messages: [] })
  .step("start", {
    run: async ({ initial }, ctx) => {
      ctx.updateContext({ count: initial });
      return complete({ msg: `Started with ${initial}` });
    },
  })
  .step("process", {
    run: async function* ({ msg }, ctx) {
      // Streaming step with progress updates
      for (let i = 0; i < 5; i++) {
        yield chunk({ progress: i });
      }
      return complete({ result: msg.toUpperCase() });
    },
  })
  .build();

// Create and run workflow
const workflowId = await engine.createWorkflow(workflow, { initial: 10 });

// Subscribe to events
engine.events.subscribe(workflowId, (event) => {
  console.log("Event:", event.eventType, event.payload);
});

// Run workflow
await engine.run(workflowId);

// Get final state
const result = await engine.getWorkflow(workflowId);
console.log("Final output:", result?.output);

await engine.shutdown();
```

### Durable adapters

The runtime does not require a specific database or queue. Implement
`JsonKeyValueStore` over the storage you already use and `WorkflowLockStore`
over its atomic lock primitive. The package supplies workflow and event-store
implementations on top of those contracts:

```typescript
import {
  AdapterEventBus,
  JsonEventStore,
  JsonWorkflowStore,
} from "@circulo-ai/wf";

const workflowStore = new JsonWorkflowStore(
  keyValueStore,
  lockStore,
  () => workflowDefinition.steps,
  { keyPrefix: "circulo:workflow:" },
);
const eventStore = new JsonEventStore(keyValueStore, "circulo:event:");
const eventBus = new AdapterEventBus(pubSubAdapter);
const engine = new WorkflowEngine({ workflowStore, eventStore, eventBus });
const id = await engine.createAndRun(workflowDefinition, input);
```

`JsonKeyValueStore.compareAndSet` is deliberately required: a read-then-write
implementation is not safe when two workers resume the same workflow. This
keeps the adapter layer small while making Postgres, Redis, SQLite, DynamoDB,
NATS, Kafka, and hosted KV/pub-sub integrations straightforward and vendor
independent. `MapJsonKeyValueStore`, `MapWorkflowLockStore`, and
`MapPubSubAdapter` are included for tests and local development.

## Architecture

### Core Components

#### Workflow Engine

The main orchestrator that manages workflow lifecycle:

```typescript
const engine = new WorkflowEngine<MyContext, MyInput, MyOutput>({
  workflowStore: new InMemoryWorkflowStore(),
  eventStore: new InMemoryEventStore(),
  eventBus: new InMemoryEventBus(),
  defaultTimeout: 30000,
  defaultRetries: 3,
});
```

#### Workflow Definition DSL

Strongly-typed builder for defining workflows:

```typescript
const workflow = defineWorkflow<Context>()
  .context({ initial: "state" })
  .step<"stepName", InputType, OutputType>("stepName", {
    run: async (input, ctx) => complete(output),
    retries: 3,
    timeout: 5000,
    backoff: (attempt) => 1000 * Math.pow(2, attempt),
  })
  .build();
```

#### Step Types

**Promise-based Steps:**

```typescript
.step("simple", {
  run: async (input, ctx) => {
    const result = await doWork(input);
    return complete(result);
  }
})
```

**Streaming Steps (Async Generators):**

```typescript
.step("streaming", {
  run: async function* (input, ctx) {
    for (const item of items) {
      yield chunk(item); // Progress update
    }
    return complete(finalResult);
  }
})
```

### Event Sourcing

All workflow state changes are captured as events:

```typescript
type WorkflowEventType =
  | "workflow.started"
  | "workflow.step.started"
  | "workflow.step.yielded"
  | "workflow.step.completed"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.paused"
  | "workflow.resumed";
```

Subscribe to events in real-time:

```typescript
const unsubscribe = engine.events.subscribe(workflowId, (event) => {
  if (event.eventType === "workflow.step.yielded") {
    console.log("Progress:", event.payload.data);
  }
});
```

### Workflow Context

Each step receives a strongly-typed context:

```typescript
interface WorkflowContext<TContext> {
  signal: AbortSignal;
  readonly workflow: {
    readonly id: string;
    readonly state: WorkflowState;
    readonly currentStep: number;
  };
  readonly data: TContext;
  updateContext(updates: Partial<TContext>): void;
  appendSteps(steps: readonly Step[]): void;
  abort(reason: string): void;
}
```

## Advanced Features

### Pause and Resume

```typescript
// Pause execution
await engine.pause(workflowId);

// Resume from where it left off
await engine.resume(workflowId);
```

`waitFor()` and `waitUntil()` persist the next resume timestamp and release the
workflow lock. With auto-resume enabled (the default), the engine resumes due
workflows on its polling interval. Call `await engine.shutdown()` when the
engine is no longer needed.

### Dynamic Step Planning

Steps can add new steps at runtime:

```typescript
.step("conditional", {
  run: async (input, ctx) => {
    if (input.needsExtra) {
      ctx.appendSteps([
        {
          id: "extra",
          name: "extra-processing",
          run: async (data) => complete(processExtra(data)),
        },
      ]);
    }
    return complete(input);
  }
})
```

### Retry Logic with Backoff

```typescript
.step("resilient", {
  run: async (input) => {
    const result = await unreliableApi(input);
    return complete(result);
  },
  retries: 5,
  timeout: 10000,
  backoff: (attempt) => 1000 * Math.pow(2, attempt), // Exponential
})
```

### Custom Stores

Implement your own persistence:

```typescript
class PostgresWorkflowStore implements WorkflowStore<Context, Input, Output> {
  async saveWorkflow(wf: Workflow<Context, Input, Output>): Promise<void> {
    await db.insert("workflows", wf);
  }

  async loadWorkflow(
    id: string,
  ): Promise<Workflow<Context, Input, Output> | null> {
    return db.findOne("workflows", { id });
  }

  async updateWorkflow(
    wf: Workflow<Context, Input, Output>,
    expectedVersion: number,
  ): Promise<boolean> {
    await db.update("workflows", { id: wf.id, version: expectedVersion }, wf);
    return true;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await db.delete("workflows", { id });
  }
}
```

## Type Safety

The entire package is built with strict TypeScript:

- No `any` types anywhere
- Generics propagate through workflow and steps
- Discriminated unions for step results
- Inference works automatically in the DSL

```typescript
// The first step input is inferred from its handler, and each following input
// is checked against the previous step's output.
const workflow = defineWorkflow<{ count: number }>()
  .context({ count: 0 })
  .step("first", {
    run: async (input: { n: number }) => complete({ doubled: input.n * 2 }),
  })
  .step("second", {
    run: async ({ doubled }) => complete({ result: String(doubled) }),
  })
  .build();
```

## Testing

Run tests in any runtime:

```bash
# Node
npm test

# Bun
bun test

# Deno
deno task test
```

## Project Structure

```
src/
├── index.ts              # Main exports
├── dsl/
│   ├── workflow-builder.ts  # Typed DSL implementation
│   └── step-helpers.ts      # Helper functions
├── engine/
│   ├── workflow-engine.ts   # Main engine
│   └── workflow-runner.ts   # Execution runtime
├── models/
│   └── workflow.ts          # Core type definitions
├── store/
│   ├── memory-workflow-store.ts
│   └── memory-event-store.ts
├── store/
│   ├── memory-event-bus.ts
│   ├── memory-event-store.ts
│   └── memory-workflow-store.ts
└── utils/
    ├── id.ts
    └── backoff.ts

test/
└── workflow.test.ts         # Runtime and type-inference coverage
```

## License

MIT
