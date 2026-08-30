import {
	ActivityWorker,
	InMemoryActivityRegistry,
	InMemoryTaskQueue,
	InMemoryWorkflowHistoryStore,
	ReplayWorkflowRunner,
	TimerWorker,
	type ReplayWorkflowDefinition,
	type WorkflowHistoryEvent,
} from "@circulo-ai/wf";

export function createExampleHarness() {
	const history = new InMemoryWorkflowHistoryStore();
	const queue = new InMemoryTaskQueue();
	const runner = new ReplayWorkflowRunner(history, queue);
	let activityWorker: ActivityWorker | undefined;
	let timerWorker: TimerWorker | undefined;

	return {
		history,
		queue,
		runner,
		async startActivities<TInput, TOutput>(
			definition: ReplayWorkflowDefinition<TInput, TOutput>,
			registry: InMemoryActivityRegistry,
		): Promise<void> {
			activityWorker = new ActivityWorker({
				id: "examples-activity-worker",
				queue,
				registry,
				history,
				pollIntervalMs: 2,
				concurrency: 4,
				onWorkflowReady: (workflowId, runId) =>
					runner.run(definition, workflowId, runId).then(() => undefined),
			});
			await activityWorker.start();
		},
		async startTimers<TInput, TOutput>(
			definition: ReplayWorkflowDefinition<TInput, TOutput>,
		): Promise<void> {
			timerWorker = new TimerWorker({
				id: "examples-timer-worker",
				queue,
				history,
				pollIntervalMs: 2,
				onWorkflowReady: (workflowId, runId) =>
					runner.run(definition, workflowId, runId).then(() => undefined),
			});
			await timerWorker.start();
		},
		async stopActivities(): Promise<void> {
			await activityWorker?.stop();
			activityWorker = undefined;
		},
		async stopTimers(): Promise<void> {
			await timerWorker?.stop();
			timerWorker = undefined;
		},
		async waitFor(
			predicate: (events: readonly WorkflowHistoryEvent[]) => boolean,
			workflowId: string,
			runId: string,
			timeoutMs = 2_000,
		): Promise<WorkflowHistoryEvent[]> {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				const events = await history.read({ workflowId, runId });
				if (predicate(events)) return events;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			const events = await history.read({ workflowId, runId });
			throw new Error(
				`Timed out waiting for workflow ${workflowId}/${runId}; last event was ${events.at(-1)?.eventType ?? "none"}`,
			);
		},
	};
}

export function completed(events: readonly WorkflowHistoryEvent[]): boolean {
	return events.at(-1)?.eventType === "workflow.completed";
}
