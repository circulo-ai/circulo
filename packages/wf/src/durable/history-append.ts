import type {
  WorkflowHistoryEventInput,
  WorkflowHistoryStore,
} from "../models";

export async function appendHistoryEvent<TPayload>(
  store: WorkflowHistoryStore,
  event: WorkflowHistoryEventInput<TPayload>,
  maxRetries = 5,
): Promise<void> {
  if (!Number.isInteger(maxRetries) || maxRetries < 1) {
    throw new RangeError("History append maxRetries must be a positive integer");
  }
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const expected = await store.nextSequence(event.workflowId, event.runId);
    const result = await store.append(event, expected);
    if (result) return;
    if (event.eventId) {
      const existing = await store.read({
        workflowId: event.workflowId,
        runId: event.runId,
      });
      const matching = existing.find((candidate) => candidate.eventId === event.eventId);
      if (matching) {
        if (
          matching.eventType !== event.eventType ||
          JSON.stringify(matching.payload) !== JSON.stringify(event.payload)
        ) {
          throw new Error(`History event id ${event.eventId} was reused with different content`);
        }
        return;
      }
    }
  }
  throw new Error(
    `Could not append history event ${event.eventType} after ${maxRetries} attempts`,
  );
}
