# WF examples

These examples are executable TypeScript programs. Run them from this package
with Bun:

```bash
for example in examples/0*.ts; do bun "$example"; done
```

They progress from a single durable activity to production-shaped composition:

| Example | Demonstrates |
| --- | --- |
| `01-basic-durable-activity.ts` | typed input/output and activity replay |
| `02-approval-and-durable-sleep.ts` | external signals, durable sleep, and continuation |
| `03-parallel-fanout-and-batch.ts` | parallel work, fan-out, and bounded batches |
| `04-saga-compensation.ts` | forward actions and compensating activities |
| `05-sleep-until-deadline.ts` | an absolute `Date`/timestamp deadline |
| `06-scheduled-workflow.ts` | cron scheduling and deterministic replay runs |

## Run a durable workflow in production

The examples use in-memory history and queues so they are easy to run locally.
Those adapters are process-local and are not durable across a restart. Production
deployments should use `createRedisDurableAdapters()` or
`createPostgresDurableAdapters()` from `@circulo-ai/wf/adapters`, then run an
activity worker and timer worker against the shared adapters.

```ts
import { createRedisDurableAdapters } from "@circulo-ai/wf/adapters";
import { ActivityWorker, ReplayWorkflowRunner, TimerWorker } from "@circulo-ai/wf/durable";

const adapters = createRedisDurableAdapters({ redis });
const runner = new ReplayWorkflowRunner(adapters.history, adapters.queue);

// Register the same workflow definition and activities in every worker.
// `onWorkflowReady` replays the run after an activity or timer completes.
```

Durable workflow code is replayed from the beginning. Keep external side effects
inside activities, and make application-level side effects idempotent. Stable
sleep IDs are part of the workflow contract:

```ts
await wf.sleep("wait-for-fulfillment", "3 days");
return await wf.activity("continue-after-sleep", input);
```

The process may exit while the workflow is waiting. The timer worker later
records `timer.fired`, and the replay runner resumes at the line after `sleep()`.
