import {
	defineActivity,
	defineDurableWorkflow,
	InMemoryActivityRegistry,
} from "@circulo-ai/wf";
import { completed, createExampleHarness } from "./_shared";

const activities = new InMemoryActivityRegistry();
activities.register(
	defineActivity<string, number>("check-stock", async (sku) => sku.length),
);
activities.register(
	defineActivity<string, boolean>("publish", async () => true),
);

const workflow = defineDurableWorkflow<string[], number>({
	name: "catalog-refresh",
	version: 1,
	activityRegistry: activities,
	run: async (wf, skus) => {
		const stock = await wf.fanOut<string, number>(skus, (sku) =>
			wf.activity("check-stock", sku),
		);
		const published = await wf.batch(
			"publish-skus",
			skus,
			(sku) => wf.activity("publish", sku),
			{ concurrency: 2 },
		);
		return stock.reduce((sum, value) => sum + value, 0) + published.completed;
	},
});

const harness = createExampleHarness();
const started = await harness.runner.start(workflow, ["A-1", "B-22", "C-333"]);
await harness.startActivities(workflow, activities);
const events = await harness.waitFor(
	completed,
	started.workflowId,
	started.runId,
);
await harness.stopActivities();

console.log({
	output: (events.at(-1)?.payload as { output: number }).output,
	activityExecutions: events.filter(
		(event) => event.eventType === "activity.completed",
	).length,
});
process.exit(0);
