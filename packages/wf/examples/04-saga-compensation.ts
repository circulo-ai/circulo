import {
  defineActivity,
  defineDurableWorkflow,
  InMemoryActivityRegistry,
} from "@circulo-ai/wf";
import { createExampleHarness } from "./_shared";

const activities = new InMemoryActivityRegistry();
activities.register(
  defineActivity<void, string>(
    "reserve-hotel",
    async () => "hotel-reservation-1",
  ),
);
activities.register(
  defineActivity<string, void>("cancel-hotel", async () => undefined),
);
activities.register(
  defineActivity<void, never>(
    "book-flight",
    async () => {
      throw new Error("flight provider declined the booking");
    },
    { retryPolicy: { maxAttempts: 1 } },
  ),
);

const workflow = defineDurableWorkflow<void, string>({
  name: "trip-booking-saga",
  version: 1,
  activityRegistry: activities,
  run: async (wf) =>
    wf.saga(async (saga) => {
      await saga.activity("reserve-hotel", undefined, {
        compensate: {
          name: "cancel-hotel",
          input: (reservation) => reservation,
        },
      });
      await saga.activity("book-flight", undefined);
      return "booked";
    }),
});

const harness = createExampleHarness();
const started = await harness.runner.start(workflow, undefined);
await harness.startActivities(workflow, activities);
const events = await harness.waitFor(
  (history) => history.at(-1)?.eventType === "workflow.failed",
  started.workflowId,
  started.runId,
);
await harness.stopActivities();

console.log({
  failedAsExpected: true,
  compensationCompleted: events.filter(
    (event) => event.eventType === "activity.completed",
  ).length,
});
process.exit(0);
