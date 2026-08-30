# Durable sleep

WF durable workflows can suspend for seconds, days, or weeks without keeping
application compute alive. Use a stable ID and a duration:

```ts
import { defineDurableWorkflow } from "@circulo-ai/wf";

const fiveSecondDemo = defineDurableWorkflow({
  name: "five-second-demo",
  version: 1,
  run: async (wf, input: { requestId: string }) => {
    await wf.sleep("short-cooldown", "5 seconds");
    return `continued:${input.requestId}`;
  },
});
```

The exact continuation is the first line after the `await`:

```text
initial run:  workflow starts -> activity history -> timer.started -> waiting
timer worker: timer task -> timer.fired -> resume request
replay:      workflow starts -> recorded activity -> fired sleep -> next line
```

```ts
import { defineActivity, defineDurableWorkflow, InMemoryActivityRegistry } from "@circulo-ai/wf";

const activities = new InMemoryActivityRegistry();
activities.register(
  defineActivity<{ approvalId: string }, { approved: boolean }>(
    "load-approval",
    async () => ({ approved: false }),
  ),
);
activities.register(
  defineActivity<{ approvalId: string }, void>(
    "send-follow-up",
    async () => undefined,
  ),
);
activities.register(
  defineActivity<{ approvalId: string }, void>(
    "complete-approval",
    async () => undefined,
  ),
);

const workflow = defineDurableWorkflow({
  name: "approval-follow-up",
  version: 1,
  activityRegistry: activities,
  run: async (wf, input: { approvalId: string }) => {
    const approval = await wf.activity("load-approval", input);
    if (!approval.approved) {
      await wf.sleep("approval-follow-up", "30 days");
      return wf.activity("send-follow-up", input);
    }
    return wf.activity("complete-approval", input);
  },
});
```

The first execution records a timer and returns `waiting`. A timer worker later
records `timer.fired` and asks the runner to replay the workflow. Recorded
activity results are reused, the sleep resolves immediately, and execution
continues after the `await` expression.

## Durations

`parseDuration()` accepts numeric milliseconds and strings such as:

```ts
parseDuration("5 seconds"); // 5000
parseDuration("3 days"); // 259200000
parseDuration("1h 20m"); // 4800000
parseDuration("30d"); // 2592000000
```

Supported units are milliseconds, seconds, minutes, hours, days, and weeks.
Months and years are rejected because their length varies by calendar.

Use `sleepUntil(id, timestamp)` when the deadline is an absolute date. WF
persists the computed deadline on the first execution and reuses it during
replay.

## Production requirements

Use durable implementations of both `WorkflowHistoryStore` and
`TaskQueueAdapter`. `InMemoryWorkflowHistoryStore` and `InMemoryTaskQueue` are
reference implementations for tests and local development only.

The Redis and PostgreSQL compositions expose `history`, `queue`,
`initialize()`, and `close()`. Timer delivery is at least once. Timer IDs,
history event IDs, queue leases, and replay execution ownership must therefore
be deterministic and idempotent. Pass the composition's lock store to the
runner to coalesce concurrent resumes across workers:

```ts
import { createRedisDurableAdapters } from "@circulo-ai/wf/adapters";
import { ReplayWorkflowRunner } from "@circulo-ai/wf/durable";

const adapters = createRedisDurableAdapters({ client: redis });
await adapters.initialize();
const runner = new ReplayWorkflowRunner(
  adapters.history,
  adapters.queue,
  { resumeLock: adapters.lockStore },
);
```

Call `await adapters.close()` during process shutdown. The composition does
not close an application-owned Redis or PostgreSQL client. External effects
belong in activities with application-level idempotency keys.

### Recovery and crash windows

The history event is authoritative. The runner uses the deterministic timer ID
to enqueue the task again on a later replay, so a crash after `timer.started`
but before enqueue does not lose the sleep. Queue leases make a delivery
recoverable after expiry, and `timer.fired` is appended with an idempotent event
ID. A worker may therefore deliver a timer more than once. Resume callbacks
may also run more than once; pass `resumeLock` to the runner and keep all
external effects in idempotent activities.

Inspect a timer and its state through history and queue ports:

```ts
const history = await adapters.history.read({ workflowId, runId });
const started = history.find((event) => event.eventType === "timer.started");
const fired = history.find((event) => event.eventType === "timer.fired");
const queueStats = await adapters.queue.stats("timer");
```

### Cancellation and timeouts

`sleep()` does not create a process-local timer and cannot be cancelled by
clearing a JavaScript handle. Implement cancellation as a durable application
command/event, or use the classic engine's `abort()` control operation. For a
deadline, prefer `sleepUntil()` or schedule a separate timeout workflow; the
activity or control-plane handler should check cancellation before making an
external change. A worker shutdown or lease expiry is recoverable and is not a
workflow timeout.

### Migration

- Replace `setTimeout()` with `await wf.sleep("stable-id", duration)` and run a
  durable history store plus delayed task queue.
- Replace classic `waitFor()` when the same workflow function must resume at a
  line after an `await`; keep `waitFor()` when step-level state transitions are
  the intended model.
- Replace provider-specific sleeps with `sleep()` and keep provider-specific
  infrastructure only in the Redis/PostgreSQL adapter composition.

Do not generate sleep IDs from timestamps, random IDs, loop counters whose
meaning can change, or request data. Changing an ID or moving a sleep across
an activity changes the replay history contract. Deploy a compatible
definition under the same version, and increment `version` for incompatible
replay changes while retaining old versions until their runs finish.

## Sleep versus classic waits

- `await wf.sleep("cooldown", "3 days")` suspends a replay workflow and
  resumes at the next line after the await.
- `waitFor(3 * DAY)` returns a step result and advances a classic step
  workflow to its next persisted step.
- `waitForAndRetry(...)` returns a step result and reruns the current classic
  step after the timer.

Never replace durable sleep with `setTimeout()`. A process-local timeout is
lost during restart, deployment, or host eviction.
