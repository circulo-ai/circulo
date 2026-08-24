import type {
  WorkflowHistoryEvent,
  WorkflowHistoryStore,
  WorkflowQueryView,
} from "../models";

export class WorkflowQueryService {
  constructor(private readonly historyStore: WorkflowHistoryStore) {}

  async get(
    workflowId: string,
    runId: string,
  ): Promise<WorkflowQueryView | null> {
    const events = await this.historyStore.read({ workflowId, runId });
    const started = events.find(
      (event) => event.eventType === "workflow.started",
    );
    if (!started) return null;
    const terminal = events.at(-1);
    const pendingActivities = pendingActivityIds(events);
    const waitingForEvents = events
      .filter((event) => event.eventType === "event.waiting")
      .map((event) => event.payload as { waitId?: string; eventName?: string })
      .filter(
        (waiting) =>
          !events.some(
            (event) =>
              event.eventType === "signal.received" &&
              (event.payload as { waitId?: string }).waitId === waiting.waitId,
          ),
      )
      .map((waiting) => waiting.eventName)
      .filter((eventName): eventName is string => eventName !== undefined);
    return {
      workflowId,
      runId,
      ...(started.tenantId === undefined ? {} : { tenantId: started.tenantId }),
      status:
        terminal?.eventType === "workflow.completed"
          ? "completed"
          : terminal?.eventType === "workflow.failed"
            ? "failed"
            : isWaiting(terminal?.eventType, pendingActivities)
              ? "waiting"
              : "running",
      historyLength: events.length,
      pendingActivities,
      waitingForEvents,
      ...(terminal?.eventType === "workflow.completed"
        ? { output: (terminal.payload as { output?: unknown }).output }
        : {}),
      ...(terminal?.eventType === "workflow.failed"
        ? { error: (terminal.payload as { error?: unknown }).error }
        : {}),
      updatedAt: events.at(-1)?.timestamp ?? started.timestamp,
    };
  }

  history(workflowId: string, runId: string): Promise<WorkflowHistoryEvent[]> {
    return this.historyStore.read({ workflowId, runId });
  }
}

function isWaiting(
  eventType: WorkflowHistoryEvent["eventType"] | undefined,
  pendingActivities: readonly string[],
): boolean {
  return (
    eventType === "event.waiting" ||
    eventType === "timer.started" ||
    (pendingActivities.length > 0 && eventType !== "activity.started")
  );
}

function pendingActivityIds(events: readonly WorkflowHistoryEvent[]): string[] {
  const scheduled = new Set<string>();
  const completed = new Set<string>();
  for (const event of events) {
    const activityId = (event.payload as { activityId?: string }).activityId;
    if (!activityId) continue;
    if (event.eventType === "activity.scheduled") scheduled.add(activityId);
    if (event.eventType === "activity.completed") completed.add(activityId);
  }
  return [...scheduled].filter((activityId) => !completed.has(activityId));
}
