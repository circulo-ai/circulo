# @workflow/orchestration

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

## Installation

```bash
npm install @workflow/orchestration
# or
bun add @workflow/orchestration
# or
deno add @workflow/orchestration
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
} from "@workflow/orchestration";

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
const workflow = defineWorkflow<MyContext>()
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
```

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
  readonly workflow: {
    readonly id: string;
    readonly state: WorkflowState;
    readonly currentStep: number;
  };
  readonly data: TContext;
  updateContext(updates: Partial<TContext>): void;
  appendSteps(steps: Step[]): void;
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

  async updateWorkflow(wf: Workflow<Context, Input, Output>): Promise<void> {
    await db.update("workflows", { id: wf.id }, wf);
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
// Types are inferred automatically
const workflow = defineWorkflow<{ count: number }>()
  .context({ count: 0 })
  .step<"first", { n: number }, { doubled: number }>("first", {
    run: async ({ n }) => complete({ doubled: n * 2 }),
    // Input/output types are enforced
  })
  .step<"second", { doubled: number }, { result: string }>("second", {
    run: async ({ doubled }) => complete({ result: String(doubled) }),
    // Previous output type becomes next input type
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
├── pubsub/
│   └── memory-event-bus.ts
└── utils/
    ├── id.ts
    └── backoff.ts

tests/
└── basic-workflow.test.ts   # Comprehensive test suite
```

## License

MIT
