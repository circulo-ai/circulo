import type {
  HistoryAppendResult,
  HistoryReadOptions,
  WorkflowHistoryEvent,
  WorkflowHistoryEventBus,
  WorkflowHistoryEventInput,
  WorkflowHistoryStore,
} from "../models";

/** Decorates any durable history store with ordered live event publication. */
export class EventPublishingWorkflowHistoryStore implements WorkflowHistoryStore {
  constructor(
    private readonly store: WorkflowHistoryStore,
    private readonly bus: WorkflowHistoryEventBus,
  ) {}

  async append<TPayload>(
    event: WorkflowHistoryEventInput<TPayload>,
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    const result = await this.store.append(event, expectedNextSequence);
    if (result) await this.publish(result.appended);
    return result;
  }

  async appendBatch<TPayload>(
    events: readonly WorkflowHistoryEventInput<TPayload>[],
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    const result = await this.store.appendBatch(events, expectedNextSequence);
    if (result) await this.publish(result.appended);
    return result;
  }

  read<TPayload = unknown>(
    options: HistoryReadOptions,
  ): Promise<WorkflowHistoryEvent<TPayload>[]> {
    return this.store.read(options);
  }

  nextSequence(workflowId: string, runId: string): Promise<number> {
    return this.store.nextSequence(workflowId, runId);
  }

  clear(workflowId: string, runId?: string): Promise<void> {
    return this.store.clear(workflowId, runId);
  }

  private async publish(
    events: readonly WorkflowHistoryEvent[],
  ): Promise<void> {
    for (const event of events) await this.bus.publish(event);
  }
}
