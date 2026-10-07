import {
  createReplayScheduleDispatcher,
  defineDurableWorkflow,
  InMemoryScheduleStore,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  ScheduleWorker,
} from "@circulo-ai/wf";

const history = new InMemoryWorkflowHistoryStore();
const runner = new ReplayWorkflowRunner(history, new InMemoryTaskQueue());
const workflow = defineDurableWorkflow<{ reportId: string }, string>({
  name: "daily-report",
  version: 1,
  run: async (_wf, input) => `report:${input.reportId}`,
});
const store = new InMemoryScheduleStore<{ reportId: string }>();
const now = Date.now();
await store.upsert(
  {
    scheduleId: "daily-report-schedule",
    cron: "* * * * *",
    workflowName: workflow.name,
    input: { reportId: "report-1" },
  },
  now - 60_000,
);

const dispatcher = createReplayScheduleDispatcher({
  runner,
  resolve: (name) => (name === workflow.name ? workflow : undefined),
});
const abort = new AbortController();
const worker = new ScheduleWorker(store, {
  workerId: "examples-scheduler",
  pollIntervalMs: 2,
  signal: abort.signal,
  onDispatch: dispatcher,
});
worker.start();

const deadline = Date.now() + 2_000;
while (Date.now() < deadline) {
  const records = await history.read({
    workflowId: "daily-report-schedule",
  });
  if (records.some((event) => event.eventType === "workflow.completed")) break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
abort.abort();
await worker.stop();

console.log("Scheduled workflow dispatched through ScheduleWorker.");
process.exit(0);
