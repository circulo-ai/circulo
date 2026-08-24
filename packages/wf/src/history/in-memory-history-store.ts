import type {
  HistoryAppendResult,
  HistoryReadOptions,
  WorkflowHistoryEvent,
  WorkflowHistoryEventInput,
  WorkflowHistoryStore,
} from "../models";
import { generateId } from "../utils/id";

/** Reference history store for tests and local replay development. */
export class InMemoryWorkflowHistoryStore implements WorkflowHistoryStore {
  private readonly histories = new Map<
    string,
    WorkflowHistoryEvent<unknown>[]
  >();

  async append<TPayload>(
    event: WorkflowHistoryEventInput<TPayload>,
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    return this.appendBatch([event], expectedNextSequence);
  }

  async appendBatch<TPayload>(
    events: readonly WorkflowHistoryEventInput<TPayload>[],
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    if (events.length === 0) {
      return { appended: [], nextSequence: expectedNextSequence };
    }
    const first = events[0]!;
    const key = historyKey(first.workflowId, first.runId);
    const history = this.histories.get(key) ?? [];
    const existingEvent = first.eventId
      ? history.find((candidate) => candidate.eventId === first.eventId)
      : undefined;
    if (existingEvent) {
      if (
        existingEvent.eventType !== first.eventType ||
        JSON.stringify(existingEvent.payload) !== JSON.stringify(first.payload)
      ) {
        throw new Error(
          `History event id ${first.eventId} was reused with different content`,
        );
      }
      return {
        appended: [structuredClone(existingEvent)],
        nextSequence: history.length,
      };
    }
    const nextSequence = history.length;
    if (nextSequence !== expectedNextSequence) return null;

    const appended = events.map((input, index) => ({
      ...structuredClone(input),
      eventId: input.eventId ?? generateId("history"),
      sequence: expectedNextSequence + index,
      timestamp: input.timestamp ?? Date.now(),
      payload: structuredClone(input.payload),
    })) as WorkflowHistoryEvent<unknown>[];
    history.push(...appended);
    this.histories.set(key, history);

    return {
      appended: structuredClone(appended),
      nextSequence: expectedNextSequence + appended.length,
    };
  }

  async read<TPayload = unknown>(
    options: HistoryReadOptions,
  ): Promise<WorkflowHistoryEvent<TPayload>[]> {
    const runs = options.runId
      ? [historyKey(options.workflowId, options.runId)]
      : [...this.histories.keys()].filter((key) =>
          key.startsWith(`${options.workflowId}:`),
        );
    const events = runs.flatMap((key) => this.histories.get(key) ?? []);
    const filtered = events
      .filter(
        (event) =>
          options.fromSequence === undefined ||
          event.sequence >= options.fromSequence,
      )
      .sort((left, right) =>
        options.runId
          ? left.sequence - right.sequence
          : left.workflowId.localeCompare(right.workflowId) ||
            left.runId.localeCompare(right.runId) ||
            left.sequence - right.sequence,
      );
    const limited =
      options.limit === undefined ? filtered : filtered.slice(0, options.limit);
    return structuredClone(limited) as WorkflowHistoryEvent<TPayload>[];
  }

  async nextSequence(workflowId: string, runId: string): Promise<number> {
    return (this.histories.get(historyKey(workflowId, runId)) ?? []).length;
  }

  async clear(workflowId: string, runId?: string): Promise<void> {
    if (runId) {
      this.histories.delete(historyKey(workflowId, runId));
      return;
    }
    for (const key of this.histories.keys()) {
      if (key.startsWith(`${workflowId}:`)) this.histories.delete(key);
    }
  }
}

function historyKey(workflowId: string, runId: string): string {
  return `${workflowId}:${runId}`;
}
