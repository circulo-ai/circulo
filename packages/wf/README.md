# @circulo-ai/wf

`@circulo-ai/wf` is a durable, framework-agnostic TypeScript workflow runtime
for backend jobs, agent orchestration, long-running business processes, data
pipelines, and React workflow experiences.

It includes a typed DSL, durable state transitions, retries, timeouts,
cancellation, pause/resume, scheduled waits, streaming progress, optimistic
concurrency, event persistence, pub/sub, metrics, logging, and lifecycle hooks.
It runs in Node.js, Bun, Deno, serverless handlers, queues, and TypeScript web
backends. React support is available through the optional
`@circulo-ai/wf/react` entry point.

## Contents

- [Install](#install)
- [Mental model](#mental-model)
- [First workflow](#first-workflow)
- [Workflow definitions](#workflow-definitions)
- [Step results](#step-results)
- [Context and cancellation](#context-and-cancellation)
- [Retries and timeouts](#retries-and-timeouts)
- [Waiting and polling](#waiting-and-polling)
- [Streaming](#streaming)
- [Dynamic plans and compensation](#dynamic-plans-and-compensation)
- [Validation and idempotency](#validation-and-idempotency)
- [Events](#events)
- [Lifecycle hooks](#lifecycle-hooks)
- [React](#react)
- [Durable adapters](#durable-adapters)
- [Production operations](#production-operations)
- [Testing with TDD](#testing-with-tdd)
- [API reference](#api-reference)

## Install

Node.js 18 or newer is required.

```bash
npm install @circulo-ai/wf
# or
bun add @circulo-ai/wf
# or
deno add npm:@circulo-ai/wf
```

React is optional and only needed for the React entry point:

```bash
npm install @circulo-ai/wf react
```

```typescript
// Framework-free core: Node, Bun, Deno, queues, serverless, or any TS backend.
import { WorkflowEngine, defineWorkflow, complete } from "@circulo-ai/wf";

// Optional React integration.
import { useWorkflow } from "@circulo-ai/wf/react";
```

## Mental model

A workflow has four layers:

1. A **definition** describes initial context and ordered steps.
2. The **engine** creates, runs, resumes, and controls workflows.
3. A **store** persists state and coordinates worker locks.
4. Events, hooks, logging, and metrics expose execution to integrations.

The runtime persists state between steps. A worker can stop after a step,
release its lock, and resume later from durable `currentStep` and `resumeAt`
values.

```text
definition -> create -> pending -> running -> step transitions
                                      |              |
                                      v              v
                                  paused/waiting   events/hooks/metrics
                                      |
                                      v
                                  resumed -> completed or failed
```

Use in-memory implementations for local development and tests. Use a durable
store, event store, and pub/sub adapter for production workers.

## First workflow

This complete example defines two typed steps, subscribes to events, runs the
workflow, reads the final state, and shuts down cleanly.

```typescript
import {
  complete,
  defineWorkflow,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  WorkflowEngine,
} from "@circulo-ai/wf";

interface CheckoutContext {
  reservationId?: string;
  totalCents: number;
}

interface CheckoutInput {
  cartId: string;
  totalCents: number;
}

interface CheckoutOutput {
  orderId: string;
  status: "confirmed";
}

const checkout = defineWorkflow<CheckoutContext, CheckoutInput>()
  .name("checkout")
  .version(1)
  .context({ totalCents: 0 })
  .step("reserve-inventory", {
    run: async (input, ctx) => {
      const reservationId = await reserveInventory(input.cartId);
      ctx.updateContext({ reservationId, totalCents: input.totalCents });
      return complete({ reservationId });
    },
  })
  .step("capture-payment", {
    run: async (input, ctx) => {
      await capturePayment(ctx.data.totalCents);
      return complete({
        orderId: await createOrder(input.reservationId),
        status: "confirmed" as const,
      });
    },
  })
  .build();

const engine = new WorkflowEngine<
  CheckoutContext,
  CheckoutInput,
  CheckoutOutput
>({
  workflowStore: new InMemoryWorkflowStore(),
  eventStore: new InMemoryEventStore(),
  eventBus: new InMemoryEventBus(),
  enableAutoResume: false,
});

const workflowId = await engine.createWorkflow(checkout, {
  cartId: "cart_123",
  totalCents: 4999,
});

const unsubscribe = engine.subscribe(workflowId, (event) => {
  console.log(event.eventType, event.payload);
});

await engine.run(workflowId);
const result = await engine.getWorkflow(workflowId);
console.log(result?.state); // completed
console.log(result?.output); // { orderId: "...", status: "confirmed" }

unsubscribe();
await engine.shutdown();

declare function reserveInventory(cartId: string): Promise<string>;
declare function capturePayment(totalCents: number): Promise<void>;
declare function createOrder(reservationId: string): Promise<string>;
```

`createWorkflow()` persists a pending workflow. Use `run()` separately when a
queue or scheduler owns execution. Use `createAndRun()` for the convenience
path:

```typescript
const workflowId = await engine.createAndRun(checkout, input);
```

## Workflow definitions

The builder carries the input and latest step output through the type system.
You can infer the first input type or provide it explicitly:

```typescript
interface Context {
  processed: number;
}

const inferred = defineWorkflow<Context>()
  .context({ processed: 0 })
  .step("double", {
    run: async (input: { value: number }) =>
      complete({ doubled: input.value * 2 }),
  })
  .step("format", {
    run: async ({ doubled }) => complete(`value=${doubled}`),
  })
  .build();

const explicit = defineWorkflow<Context, { value: number }>()
  .context({ processed: 0 })
  .step("double", {
    run: async ({ value }) => complete(value * 2),
  })
  .build();
```

Names and versions are persisted in workflow metadata:

```typescript
const workflow = defineWorkflow<Context, Input>()
  .name("invoice-reconciliation")
  .version(3)
  .context({ processed: 0 })
  .step("reconcile", {
    run: async (input) => complete(await reconcileInvoice(input)),
  })
  .build();
```

Workflows must have a context and at least one step. Context is cloned when a
workflow is created, so mutating the original definition later is safe.

## Step results

Every step returns a discriminated `StepResult`.

### Complete or fail

```typescript
import { complete, error } from "@circulo-ai/wf";

.step("load", {
  run: async (input) => complete(await repository.load(input.id)),
})

.step("check", {
  run: async (input) => {
    if (!input.ready) return error("Record is not ready", "transient", true);
    return complete({ ready: true });
  },
})
```

An explicit error becomes a `WorkflowError`. Set `retryable: true` for a
transient failure that should be retried.

### Wait

`waitFor()` resumes at the next step. `waitForAndRetry()` reruns the same
step, which is ideal for polling.

```typescript
import { waitFor, waitForAndRetry, waitUntil } from "@circulo-ai/wf";

.step("cooldown", {
  run: async () => waitFor(5_000, { reason: "rate-limit" }),
})

.step("poll-provider", {
  run: async (input) => {
    const status = await provider.status(input.jobId);
    return status.complete ? complete(status) : waitForAndRetry(2_000, status);
  },
})

.step("schedule", {
  run: async (input) => waitUntil(input.runAt, input),
})
```

Wait values must be finite and non-negative. The workflow becomes `paused`,
the lock is released, and `resumeAt` is persisted.

## Context and cancellation

Each step receives a typed context:

```typescript
interface WorkflowContext<TContext> {
  readonly signal: AbortSignal;
  readonly workflow: {
    readonly id: string;
    readonly state: WorkflowState;
    readonly currentStep: number;
    readonly version: number;
  };
  readonly data: TContext;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  updateContext(updates: Partial<TContext>): void;
  appendSteps(steps: readonly Step[]): void;
  abort(reason: string, errorType?: ErrorType): void;
}
```

Use `ctx.updateContext()` to persist changes after a successful step. Do not
mutate `ctx.data` directly. Forward `ctx.signal` to fetch or SDK calls:

```typescript
.step("download", {
  run: async (input, ctx) => {
    const response = await fetch(input.url, { signal: ctx.signal });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return complete(await response.arrayBuffer());
  },
})
```

Controllers can abort with a durable reason:

```typescript
await engine.abort(workflowId, "Request cancelled", "permanent");
```

Aborting a completed or failed workflow is a no-op. A running workflow becomes
`failed` with the supplied error. Pausing a terminal workflow is also a no-op.

## Retries and timeouts

Configure retries per step or with engine-wide defaults:

```typescript
const engine = new WorkflowEngine({
  workflowStore,
  eventStore,
  eventBus,
  defaultRetries: 3,
  defaultTimeout: 30_000,
});

const workflow = defineWorkflow<Context, Input>()
  .context({ processed: 0 })
  .step("call-service", {
    retries: 5,
    timeout: 10_000,
    backoff: (attempt) => Math.min(250 * 2 ** attempt, 30_000),
    run: async (input) => complete(await callService(input)),
  })
  .build();
```

Use `errorClassifier` for service-specific failures:

```typescript
.step("charge-card", {
  retries: 2,
  errorClassifier: (cause) => {
    if (cause instanceof PaymentRateLimitError) return "transient";
    if (cause instanceof InvalidCardError) return "validation";
    return "permanent";
  },
  run: async (input) => complete(await chargeCard(input)),
})
```

Retry attempts emit `workflow.retrying`. A step timeout produces a `timeout`
error. A workflow deadline can be set on the definition or engine:

```typescript
const workflow = defineWorkflow<Context, Input>()
  .context({ processed: 0 })
  .maxExecutionTime(5 * 60_000)
  .step("run", { run: async (input) => complete(await process(input)) })
  .build();
```

## Waiting and polling

Waiting is durable rather than an in-memory sleep, so it survives restarts and
worker replacement:

```typescript
const workflow = defineWorkflow<Context, { jobId: string }>()
  .context({ processed: 0 })
  .step("wait-for-job", {
    run: async (input) => {
      const status = await getJobStatus(input.jobId);
      if (status === "complete") return complete(status);
      if (status === "failed") return error("Provider job failed", "permanent");
      return waitForAndRetry(10_000, { lastStatus: status });
    },
  })
  .build();

const id = await engine.createWorkflow(workflow, { jobId: "job_123" });
await engine.run(id); // resolves while the workflow is paused
await engine.resumeDueWorkflows();
```

Auto-resume is enabled by default. Disable it when a queue or scheduler owns
resumption:

```typescript
const engine = new WorkflowEngine({
  workflowStore,
  eventStore,
  eventBus,
  enableAutoResume: false,
});
setInterval(() => void engine.resumeDueWorkflows(), 1_000);
```

## Streaming

An async generator can yield `chunk()` values. Each chunk becomes a
`workflow.step.yielded` event; only `complete()` becomes workflow output.

```typescript
import { chunk, complete } from "@circulo-ai/wf";

const workflow = defineWorkflow<Context, { files: string[] }>()
  .context({ processed: 0 })
  .step("index-files", {
    run: async function* ({ files }, ctx) {
      for (const [index, file] of files.entries()) {
        await indexFile(file, ctx.signal);
        ctx.updateContext({ processed: index + 1 });
        yield chunk({ file, processed: index + 1, total: files.length });
      }
      return complete({ indexed: files.length });
    },
  })
  .build();
```

`streamStep(items)` is a convenience generator for non-empty arrays. It
rejects empty arrays because there is no final value.

## Dynamic plans and compensation

Append steps when the next part of a plan is only known at runtime:

```typescript
.step("plan", {
  run: async (input, ctx) => {
    if (input.needsVerification) {
      ctx.appendSteps([
        {
          id: "verify",
          name: "verify",
          run: async (value) => complete(await verify(value)),
        },
      ]);
    }
    return complete(input);
  },
})
```

Compensate side effects when a later step fails:

```typescript
.step("reserve", {
  run: async (input, ctx) => {
    const reservationId = await reserve(input);
    ctx.updateContext({ reservationId });
    return complete(reservationId);
  },
  compensation: async (_, ctx) => {
    if (ctx.data.reservationId) {
      await releaseReservation(ctx.data.reservationId);
    }
  },
})
```

Compensation failures are logged and do not hide the original error. For
irreversible side effects, use idempotency plus an outbox or saga pattern.

## Validation and idempotency

Validate before a workflow record is persisted:

```typescript
const workflow = defineWorkflow<Context, { email: string }>()
  .context({ processed: 0 })
  .validate(async ({ email }) => email.includes("@"))
  .step("send", {
    run: async ({ email }) => complete(await sendEmail(email)),
  })
  .build();
```

Invalid input causes `createWorkflow()` to reject without creating a record.

Tags are string pairs for filtering; metadata is structured integration data:

```typescript
const workflow = defineWorkflow<Context, Input>()
  .context({ processed: 0 })
  .tags({ team: "billing", environment: "production" })
  .metadata({ owner: "payments", schema: 2 })
  .step("run", { run: async (input) => complete(await process(input)) })
  .build();

const billingRuns = await engine.listWorkflows({
  tags: { team: "billing" },
  state: "completed",
  limit: 50,
});
```

`transform()` runs after steps complete and before the completed state is
persisted:

```typescript
const workflow = defineWorkflow<Context, Input>()
  .context({ processed: 0 })
  .step("calculate", { run: async (input) => complete(await calculate(input)) })
  .transform((result) => ({ ...result, generatedAt: Date.now() }))
  .build();
```

Transforms are runtime-only. If a workflow resumes in another process, pass a
transform to `engine.run(workflowId, transform)` or register the same
definition there.

An idempotency key prevents duplicate creation requests:

```typescript
const workflow = defineWorkflow<Context, Input>()
  .context({ processed: 0 })
  .idempotencyKey("checkout-request-123")
  .step("checkout", { run: async (input) => complete(await checkout(input)) })
  .build();

const first = await engine.createWorkflow(workflow, input);
const second = await engine.createWorkflow(workflow, differentInput);
console.log(first === second); // true
```

For request-scoped idempotency, create the definition from a request factory so
each request receives its own key.

## Events

Events are appended and published before a run resolves. Subscribe to one
workflow or to every workflow:

```typescript
const unsubscribe = engine.subscribe(workflowId, async (event) => {
  switch (event.eventType) {
    case "workflow.step.yielded":
      console.log("progress", event.payload.data);
      break;
    case "workflow.failed":
      await notifyOnCall(event.payload.error);
      break;
    case "workflow.completed":
      console.log("complete", event.payload.output);
      break;
  }
});

const unsubscribeAll = engine.subscribeAll((event) => {
  console.log(event.workflowId, event.eventType);
});

const history = await engine.getEvents(workflowId);
const recent = await engine.getEvents(workflowId, Date.now() - 60_000);

unsubscribe();
unsubscribeAll();
```

| Event                     | Meaning                                                   |
| ------------------------- | --------------------------------------------------------- |
| `workflow.started`        | A workflow began or resumed execution.                    |
| `workflow.step.started`   | A step attempt began.                                     |
| `workflow.step.yielded`   | A streaming step yielded progress.                        |
| `workflow.step.completed` | A step completed, including a step that requested a wait. |
| `workflow.retrying`       | A retry was scheduled with an attempt and delay.          |
| `workflow.waiting`        | A durable resume timestamp was persisted.                 |
| `workflow.paused`         | Execution was paused by a controller.                     |
| `workflow.resumed`        | A paused workflow was resumed.                            |
| `workflow.completed`      | The workflow completed successfully.                      |
| `workflow.failed`         | The workflow reached a terminal failure.                  |

`workflow.created`, `workflow.deleted`, `engine.started`, and
`engine.shutdown` are lifecycle hook names, not persisted event types.

## Lifecycle hooks

Hooks are the integration surface for tracing, notifications, analytics,
request correlation, and backend observability. Handlers run in descending
priority order and are awaited. They can be removed, registered once, or
registered for every lifecycle name.

```typescript
import { WorkflowHookManager } from "@circulo-ai/wf";

const hooks = new WorkflowHookManager<Context, Input, Output>({
  onError: (error, context) => {
    logger.error("workflow hook failed", error as Error, {
      hook: context.name,
      workflowId: context.workflowId,
    });
  },
});

const stopTracing = hooks.onAny(
  async ({ name, workflowId, event }) => {
    await tracer.record(name, { workflowId, event });
  },
  { priority: 100 },
);

hooks.on("workflow.failed", async ({ workflow, error }) => {
  await alerts.send({ workflowId: workflow?.id, error });
});

hooks.once("engine.started", () => console.log("engine is ready"));

const engine = new WorkflowEngine({
  workflowStore,
  eventStore,
  eventBus,
  hooks,
});

stopTracing();
```

The manager is framework-free and works in Node.js, Bun, Deno, Next.js route
handlers, Hono, Express, Fastify, queues, and serverless functions. Access it
as `engine.hooks` or `engine.lifecycle` when owned by the engine.

Hook failures are isolated and reported by default. Use `failFast: true` only
when the hook is intentionally part of the operation:

```typescript
const transactionalHooks = new WorkflowHookManager({
  failFast: true,
  onError: async (error) => auditLog.recordFailure(error),
});
```

## React

React support is optional and tree-shakeable; the core package never imports
React.

### Workflow state and actions

```tsx
import { useWorkflow, useWorkflowHook } from "@circulo-ai/wf/react";
import type { WorkflowEngine } from "@circulo-ai/wf";

interface Props {
  engine: WorkflowEngine<Context, Input, Output>;
  workflowId: string;
}

export function WorkflowStatus({ engine, workflowId }: Props) {
  const { workflow, lastEvent, isLoading, error, pause, resume, abort } =
    useWorkflow(engine, workflowId);

  useWorkflowHook(engine, "workflow.failed", ({ error: workflowError }) => {
    console.error("Workflow failed", workflowError);
  });

  if (isLoading) return <p>Loading workflow…</p>;
  if (error) return <p role="alert">Could not load: {error.message}</p>;
  if (!workflow) return <p>Workflow not found.</p>;

  return (
    <section aria-label="Workflow status">
      <p>State: {workflow.state}</p>
      <p>Current step: {workflow.currentStep + 1}</p>
      <p>Last event: {lastEvent?.eventType ?? "none"}</p>
      <button
        onClick={() => void pause()}
        disabled={workflow.state !== "running"}
      >
        Pause
      </button>
      <button
        onClick={() => void resume()}
        disabled={workflow.state !== "paused"}
      >
        Resume
      </button>
      <button onClick={() => void abort("Cancelled from UI")}>Cancel</button>
    </section>
  );
}
```

### Bounded event timelines

`useWorkflowEvents()` loads persisted history and subscribes to new events.
`maxEvents` prevents unbounded browser memory use.

```tsx
import { useWorkflowEvents } from "@circulo-ai/wf/react";

export function WorkflowTimeline({ engine, workflowId }: Props) {
  const { events, isLoading, error } = useWorkflowEvents(engine, workflowId, {
    maxEvents: 100,
    eventTypes: [
      "workflow.step.yielded",
      "workflow.completed",
      "workflow.failed",
    ],
  });

  if (isLoading) return <p>Loading history…</p>;
  if (error) return <p>{error.message}</p>;

  return (
    <ol>
      {events.map((event) => (
        <li key={event.id}>
          {event.eventType} — {new Date(event.timestamp).toLocaleTimeString()}
        </li>
      ))}
    </ol>
  );
}
```

### Component-scoped lifecycle hooks

```tsx
import { useWorkflowHook } from "@circulo-ai/wf/react";

export function WorkflowNotifications({ engine }: { engine: Engine }) {
  useWorkflowHook(engine, "workflow.completed", ({ workflow }) => {
    toast.success(`Completed: ${workflow?.id ?? "unknown"}`);
  });
  useWorkflowHook(engine, "workflow.failed", ({ workflow, error }) => {
    toast.error(`Failed: ${workflow?.id ?? "unknown"}`);
    console.error(error);
  });
  return null;
}
```

## Durable adapters

The in-memory stores are for local development and tests. Production workers
should use durable `WorkflowStore`, `EventStore`, and `EventBus` implementations.

### JSON key/value adapter

`JsonWorkflowStore` persists JSON-safe state and reconstructs step functions
from a `stepsFactory` after a restart. `compareAndSet()` prevents two workers
from committing the same version.

```typescript
import {
  AdapterEventBus,
  JsonEventStore,
  JsonWorkflowStore,
} from "@circulo-ai/wf";

const workflowStore = new JsonWorkflowStore(
  keyValueStore,
  lockStore,
  () => checkout.steps,
  { keyPrefix: "app:workflow:" },
);
const eventStore = new JsonEventStore(keyValueStore, "app:event:");
const eventBus = new AdapterEventBus(pubSubAdapter, "app:pubsub:");
const engine = new WorkflowEngine({ workflowStore, eventStore, eventBus });
```

The contracts are intentionally small:

```typescript
interface JsonKeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  compareAndSet<T>(
    key: string,
    expectedVersion: number,
    value: T,
  ): Promise<boolean>;
  delete(key: string): Promise<void>;
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
}

interface WorkflowLockStore {
  acquireLock(
    workflowId: string,
    ttl: number,
    holder: string,
  ): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
  renewLock(lock: Lock, ttl: number): Promise<boolean>;
}
```

These contracts map to Postgres, Redis, SQLite, DynamoDB, NATS, Kafka-backed
projections, or hosted KV and pub/sub services. The package exports
`MapJsonKeyValueStore`, `MapWorkflowLockStore`, and `MapPubSubAdapter` for
local adapter tests.

### Custom workflow store

Implement the full `WorkflowStore` contract when your persistence layer is not
JSON-oriented. `updateWorkflow` must return `false` for a stale version:

```typescript
import type {
  Lock,
  Workflow,
  WorkflowFilter,
  WorkflowStore,
} from "@circulo-ai/wf";

class PostgresWorkflowStore<Context, Input, Output> implements WorkflowStore<
  Context,
  Input,
  Output
> {
  async saveWorkflow(
    workflow: Workflow<Context, Input, Output>,
  ): Promise<void> {
    await db.insert("workflows", serialize(workflow));
  }
  async loadWorkflow(
    id: string,
  ): Promise<Workflow<Context, Input, Output> | null> {
    const row = await db.oneOrNone("workflows", { id });
    return row ? deserialize(row) : null;
  }
  async updateWorkflow(
    workflow: Workflow<Context, Input, Output>,
    expectedVersion: number,
  ): Promise<boolean> {
    const updated = await db.update(
      "workflows",
      { id: workflow.id, version: expectedVersion },
      serialize({ ...workflow, version: expectedVersion + 1 }),
    );
    if (updated) workflow.version = expectedVersion + 1;
    return updated;
  }
  async deleteWorkflow(id: string): Promise<void> {
    await db.delete("workflows", { id });
  }
  async listWorkflows(filter?: WorkflowFilter) {
    return db.queryWorkflows(filter);
  }
  async acquireLock(workflowId: string, ttl: number): Promise<Lock | null> {
    return db.acquireWorkflowLock(workflowId, ttl);
  }
  async releaseLock(lock: Lock): Promise<void> {
    await db.releaseWorkflowLock(lock);
  }
  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    return db.renewWorkflowLock(lock, ttl);
  }
}
```

A read-then-write implementation is not sufficient for durable concurrency.

## Production operations

```typescript
const engine = new WorkflowEngine({
  workflowStore,
  eventStore,
  eventBus,
  logger,
  metrics,
  defaultTimeout: 30_000,
  defaultRetries: 3,
  lockTTL: 30_000,
  lockRenewInterval: 10_000,
  maxConcurrentWorkflows: 25,
  workflowTimeout: 15 * 60_000,
  enableAutoResume: true,
  enableHealthCheck: true,
  autoResumeIntervalMs: 1_000,
});
```

Recommended practices:

- Use atomic compare-and-set updates and distributed TTL locks.
- Keep lock renewal comfortably below the lock TTL.
- Make external side effects idempotent; a worker can crash after the side
  effect and before persisting its state.
- Keep JSON adapter context, input, output, metadata, and events serializable.
- Keep secrets out of persisted context and metadata.
- Alert on failures, retries, waits, and abnormal queue depth.
- Disable auto-resume when a queue or scheduler owns resumption.
- Always call `await engine.shutdown()` during graceful process shutdown.
- Bound React history with `maxEvents`.
- Register hook error handlers and make hook failures observable.

Health checks expose active, queued, and failed workflow counts:

```typescript
const health = await engine.getHealth();
if (!health.healthy) return Response.json(health, { status: 503 });
console.log(health.details);
```

Graceful shutdown:

```typescript
const shutdown = () => engine.shutdown(true);
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
```

## Testing with TDD

The package uses strict TypeScript and Vitest. Test definition, execution,
persistence, and integration behavior.

```bash
cd packages/wf
bun run typecheck
bun run test
bun run build
```

Start with a failing behavior test and assert both attempts and durable state:

```typescript
import { expect, it } from "vitest";
import {
  complete,
  defineWorkflow,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  WorkflowEngine,
} from "@circulo-ai/wf";

it("retries a transient step and eventually completes", async () => {
  let attempts = 0;
  const workflow = defineWorkflow<{ count: number }, void>()
    .context({ count: 0 })
    .step("unstable", {
      retries: 1,
      backoff: () => 0,
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("network unavailable");
        return complete("ok");
      },
    })
    .build();
  const engine = new WorkflowEngine({
    workflowStore: new InMemoryWorkflowStore(),
    eventStore: new InMemoryEventStore(),
    eventBus: new InMemoryEventBus(),
    enableAutoResume: false,
  });
  const id = await engine.createAndRun(workflow, undefined);
  expect(attempts).toBe(2);
  expect((await engine.getWorkflow(id))?.state).toBe("completed");
  await engine.shutdown();
});
```

Production workflow test matrix:

- valid and invalid validation;
- inferred and explicit input/output types;
- success, explicit errors, thrown errors, and classified errors;
- retries, backoff, retry exhaustion, and timeouts;
- cancellation while awaiting I/O;
- pause/resume, durable waits, and polling;
- streaming chunks and final output;
- dynamic steps and compensation;
- idempotent creation and duplicate run requests;
- stale versions and lock contention;
- event ordering, filters, unsubscribe, and callback isolation;
- store cloning, retention, CAS, and lock renewal;
- active/queued shutdown;
- hook ordering, one-shot hooks, isolation, fail-fast, and disposal;
- React loading, empty, error, live-update, and bounded-history states.

The repository covers these scenarios in `test/workflow.test.ts` and
`test/edge-cases.test.ts`.

## API reference

| Export                                  | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `WorkflowEngine`                        | Creates, runs, pauses, resumes, aborts, lists, and shuts down workflows. |
| `WorkflowRunner`                        | Lower-level durable execution runtime.                                   |
| `defineWorkflow` / `WorkflowBuilder`    | Typed workflow definition.                                               |
| `complete` / `error`                    | Terminal and error results.                                              |
| `chunk` / `streamStep`                  | Streaming results.                                                       |
| `waitFor` / `waitUntil`                 | Durable wait for the next step.                                          |
| `waitForAndRetry` / `waitUntilAndRetry` | Durable wait and rerun current step.                                     |
| `WorkflowHookManager` / `WorkflowHooks` | Lifecycle registration and dispatch.                                     |
| `InMemory*`                             | Local stores, bus, metrics, and testing implementations.                 |
| `JsonWorkflowStore` / `JsonEventStore`  | JSON-backed durable adapters.                                            |
| `AdapterEventBus`                       | Pub/sub transport bridge.                                                |

Workflow states are `pending`, `running`, `paused`, `failed`, and `completed`.
Error types are `transient`, `permanent`, `timeout`, `validation`, and
`unknown`.

## Project structure

```text
src/
├── index.ts                 # Core public exports
├── react.ts                 # Optional React exports
├── dsl/                     # Typed builder and result helpers
├── engine/                  # Scheduling and durable execution
├── hooks/                   # Hook registry and dispatch
├── models/                  # Public contracts and unions
├── adapters/                # JSON stores and pub/sub bridges
├── store/                   # In-memory implementations
└── utils/                   # IDs, backoff, logging, and metrics

test/
├── workflow.test.ts         # DSL, engine, hooks, and adapters
└── edge-cases.test.ts       # Failure, lifecycle, store, and integration edges
```

## License

MIT
