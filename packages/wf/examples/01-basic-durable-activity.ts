import {
	defineActivity,
	defineDurableWorkflow,
	InMemoryActivityRegistry,
} from "@circulo-ai/wf";
import { completed, createExampleHarness } from "./_shared";

interface OrderInput {
	orderId: string;
}

const activities = new InMemoryActivityRegistry();
activities.register(
	defineActivity<OrderInput, { orderId: string; total: number }>(
		"load-order",
		async (input) => ({ orderId: input.orderId, total: 42 }),
	),
);

const workflow = defineDurableWorkflow<OrderInput, string>({
	name: "basic-order-summary",
	version: 1,
	activityRegistry: activities,
	run: async (wf, input) => {
		const order = await wf.activity<
			OrderInput,
			{ orderId: string; total: number }
		>("load-order", input);
		return `${order.orderId}:$${order.total}`;
	},
});

const harness = createExampleHarness();
const started = await harness.runner.start(workflow, { orderId: "order-1001" });
await harness.startActivities(workflow, activities);
const events = await harness.waitFor(
	completed,
	started.workflowId,
	started.runId,
);
await harness.stopActivities();

console.log({
	status: "completed",
	output: (events.at(-1)?.payload as { output: string }).output,
	activityExecutions: events.filter(
		(event) => event.eventType === "activity.completed",
	).length,
});
process.exit(0);
