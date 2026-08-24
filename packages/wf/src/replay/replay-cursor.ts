import type { HistoryEventType, WorkflowHistoryEvent } from "../models";

export class WorkflowReplayError extends Error {
  constructor(
    message: string,
    readonly sequence?: number,
  ) {
    super(message);
    this.name = "WorkflowReplayError";
  }
}

/**
 * Sequential, read-only view over a workflow run's authoritative history.
 * Workflow runners use this to consume previously recorded commands/results
 * instead of executing side effects again.
 */
export class WorkflowReplayCursor {
  private position = 0;
  private readonly consumedSequences = new Set<number>();

  constructor(
    private readonly history: readonly WorkflowHistoryEvent<unknown>[],
  ) {
    validateHistory(history);
  }

  get consumed(): number {
    return this.position;
  }

  get remaining(): number {
    return this.history.length - this.consumedSequences.size;
  }

  get done(): boolean {
    return this.remaining === 0;
  }

  peek<TPayload = unknown>(): WorkflowHistoryEvent<TPayload> | undefined {
    while (
      this.position < this.history.length &&
      this.consumedSequences.has(this.history[this.position]!.sequence)
    ) {
      this.position += 1;
    }
    const event = this.history[this.position];
    return event as WorkflowHistoryEvent<TPayload> | undefined;
  }

  take<TPayload = unknown>(
    eventType: HistoryEventType,
    predicate?: (event: WorkflowHistoryEvent<TPayload>) => boolean,
  ): WorkflowHistoryEvent<TPayload> {
    const event = this.peek<TPayload>();
    if (!event) {
      throw new WorkflowReplayError(
        `Expected ${eventType}, but history is exhausted`,
      );
    }
    if (event.eventType !== eventType) {
      throw new WorkflowReplayError(
        `Expected ${eventType}, received ${event.eventType} at sequence ${event.sequence}`,
        event.sequence,
      );
    }
    if (predicate && !predicate(event)) {
      throw new WorkflowReplayError(
        `History event ${event.eventId} failed replay validation at sequence ${event.sequence}`,
        event.sequence,
      );
    }
    this.consumedSequences.add(event.sequence);
    this.position += 1;
    return event;
  }

  takeIf<TPayload = unknown>(
    eventType: HistoryEventType,
    predicate?: (event: WorkflowHistoryEvent<TPayload>) => boolean,
  ): WorkflowHistoryEvent<TPayload> | undefined {
    const event = this.peek<TPayload>();
    if (!event || event.eventType !== eventType) return undefined;
    if (predicate && !predicate(event)) return undefined;
    this.consumedSequences.add(event.sequence);
    this.position += 1;
    return event;
  }

  /** Consume a matching event regardless of completion order. */
  find<TPayload = unknown>(
    eventType: HistoryEventType,
    predicate?: (event: WorkflowHistoryEvent<TPayload>) => boolean,
  ): WorkflowHistoryEvent<TPayload> | undefined {
    for (const event of this.history) {
      if (
        this.consumedSequences.has(event.sequence) ||
        event.eventType !== eventType
      ) {
        continue;
      }
      const typed = event as WorkflowHistoryEvent<TPayload>;
      if (predicate && !predicate(typed)) continue;
      this.consumedSequences.add(event.sequence);
      return typed;
    }
    return undefined;
  }

  assertDone(): void {
    const event = this.peek();
    if (event) {
      throw new WorkflowReplayError(
        `Replay finished with unconsumed ${event.eventType} at sequence ${event.sequence}`,
        event.sequence,
      );
    }
  }
}

function validateHistory(
  history: readonly WorkflowHistoryEvent<unknown>[],
): void {
  for (let index = 0; index < history.length; index += 1) {
    const event = history[index]!;
    if (event.sequence !== index) {
      throw new WorkflowReplayError(
        `History sequence gap at index ${index}; received ${event.sequence}`,
        event.sequence,
      );
    }
  }
}
