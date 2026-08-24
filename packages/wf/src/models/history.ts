export type HistoryEventType =
  | "workflow.started"
  | "workflow.task.scheduled"
  | "workflow.task.started"
  | "workflow.task.completed"
  | "workflow.task.failed"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.cancelled"
  | "activity.scheduled"
  | "activity.started"
  | "activity.completed"
  | "activity.failed"
  | "activity.cancelled"
  | "timer.started"
  | "timer.fired"
  | "event.waiting"
  | "signal.received"
  | "child.workflow.started"
  | "child.workflow.completed"
  | "child.workflow.failed"
  | "parallel.started"
  | "parallel.joined"
  | "saga.compensation.started"
  | "saga.compensation.completed"
  | "saga.compensation.failed";

export interface WorkflowHistoryEvent<TPayload = unknown> {
  eventId: string;
  workflowId: string;
  runId: string;
  tenantId?: string | undefined;
  sequence: number;
  eventType: HistoryEventType;
  timestamp: number;
  payload: TPayload;
  traceContext?: Record<string, string> | undefined;
}

export type WorkflowHistoryEventInput<TPayload = unknown> = Omit<
  WorkflowHistoryEvent<TPayload>,
  "eventId" | "sequence" | "timestamp"
> & {
  eventId?: string | undefined;
  timestamp?: number | undefined;
};

export interface HistoryReadOptions {
  workflowId: string;
  runId?: string | undefined;
  fromSequence?: number | undefined;
  limit?: number | undefined;
}

export interface HistoryAppendResult {
  appended: readonly WorkflowHistoryEvent[];
  nextSequence: number;
}

/**
 * Authoritative append-only execution history.
 *
 * Implementations must make `expectedNextSequence` part of the same atomic
 * operation as the append. A stale writer must return false rather than
 * creating a forked history.
 */
export interface WorkflowHistoryStore {
  append<TPayload>(
    event: WorkflowHistoryEventInput<TPayload>,
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null>;
  appendBatch<TPayload>(
    events: readonly WorkflowHistoryEventInput<TPayload>[],
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null>;
  read<TPayload = unknown>(
    options: HistoryReadOptions,
  ): Promise<WorkflowHistoryEvent<TPayload>[]>;
  nextSequence(workflowId: string, runId: string): Promise<number>;
  clear(workflowId: string, runId?: string): Promise<void>;
}

export type WorkflowHistoryEventCallback = (
  event: WorkflowHistoryEvent,
) => void | Promise<void>;

export interface WorkflowHistoryEventBus {
  publish(event: WorkflowHistoryEvent): Promise<void>;
  subscribe(
    workflowId: string,
    runId: string,
    callback: WorkflowHistoryEventCallback,
  ): () => void;
}
