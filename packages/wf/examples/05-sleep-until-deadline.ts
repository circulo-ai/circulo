import { defineDurableWorkflow } from "@circulo-ai/wf";
import { completed, createExampleHarness } from "./_shared";

const workflow = defineDurableWorkflow<{ remindAt: number }, string>({
	name: "deadline-reminder",
	version: 1,
	run: async (wf, input) => {
		await wf.sleepUntil("reminder-deadline", input.remindAt);
		return "reminder-sent";
	},
});

const harness = createExampleHarness();
const started = await harness.runner.start(workflow, {
	remindAt: Date.now() + 30,
});
await harness.startTimers(workflow);
const events = await harness.waitFor(
	completed,
	started.workflowId,
	started.runId,
);
await harness.stopTimers();

console.log({
	output: (events.at(-1)?.payload as { output: string }).output,
	usedAbsoluteTimestamp: true,
});
process.exit(0);
