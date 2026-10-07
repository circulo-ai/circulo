import {
  defineActivity,
  defineDurableWorkflow,
  InMemoryActivityRegistry,
} from "@circulo-ai/wf";
import { completed, createExampleHarness } from "./_shared";

interface ApprovalInput {
  orderId: string;
}

const activities = new InMemoryActivityRegistry();
activities.register(
  defineActivity<ApprovalInput, string>(
    "fulfill-order",
    async ({ orderId }) => `fulfilled:${orderId}`,
  ),
);

const workflow = defineDurableWorkflow<ApprovalInput, string>({
  name: "approval-and-fulfillment",
  version: 1,
  activityRegistry: activities,
  run: async (wf, input) => {
    const approval = await wf.waitForEvent<{ approved: boolean }>(
      "manager-approval",
      "order.approved",
    );
    if (!approval.approved) return "rejected";

    // Use "3 days" in production. A short duration keeps this example quick.
    await wf.sleep("fulfillment-cooldown", "30ms");
    return wf.activity("fulfill-order", input);
  },
});

const harness = createExampleHarness();
const started = await harness.runner.start(workflow, { orderId: "order-2002" });
const historyAfterWait = await harness.waitFor(
  (events) => events.at(-1)?.eventType === "event.waiting",
  started.workflowId,
  started.runId,
);
const waitId = (historyAfterWait.at(-1)?.payload as { waitId: string }).waitId;

await harness.runner.signal(
  started.workflowId,
  started.runId,
  waitId,
  "order.approved",
  { approved: true },
);
await harness.runner.run(workflow, started.workflowId, started.runId);
await harness.startTimers(workflow);
await harness.waitFor(
  (events) => events.some((event) => event.eventType === "timer.fired"),
  started.workflowId,
  started.runId,
);
await harness.stopTimers();
await harness.startActivities(workflow, activities);
const events = await harness.waitFor(
  completed,
  started.workflowId,
  started.runId,
);
await harness.stopActivities();

console.log({
  output: (events.at(-1)?.payload as { output: string }).output,
  replayedAfterSleep: events.some((event) => event.eventType === "timer.fired"),
});
process.exit(0);
