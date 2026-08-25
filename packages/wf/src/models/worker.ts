export type WorkerRole =
  | "workflow"
  | "activity"
  | "scheduler"
  | "recovery"
  | "gateway";

export type TaskKind = "workflow" | "activity" | "timer" | "event";

export interface TaskFailure {
  message: string;
  code?: string | undefined;
  retryable: boolean;
  timestamp: number;
}

export interface TaskRetryPolicy {
  initialDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
  multiplier?: number | undefined;
  jitter?: number | undefined;
}

export interface TaskLease {
  token: string;
  workerId: string;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Serializable work item passed between a durable task queue and a worker.
 * Payloads must be JSON-safe in production adapters.
 */
export interface TaskEnvelope<TPayload = unknown> {
  id: string;
  kind: TaskKind;
  queue: string;
  workflowId?: string | undefined;
  runId?: string | undefined;
  tenantId?: string | undefined;
  payload: TPayload;
  attempt: number;
  maxAttempts: number;
  retryPolicy?: TaskRetryPolicy | undefined;
  priority: number;
  createdAt: number;
  availableAt: number;
  lease?: TaskLease | undefined;
  traceContext?: Record<string, string> | undefined;
}

export interface ClaimedTask<TPayload = unknown> {
  task: TaskEnvelope<TPayload>;
  lease: TaskLease;
}

export interface TaskClaimOptions {
  queue: string;
  workerId: string;
  leaseDurationMs: number;
  tenantId?: string | undefined;
  now?: number | undefined;
}

export interface TaskRescheduleOptions {
  availableAt: number;
  failure: TaskFailure;
}

export interface TaskQueueStats {
  queued: number;
  leased: number;
  expiredLeases: number;
}

/**
 * Atomic operations required from a production task queue adapter.
 *
 * `claim`, `heartbeat`, `acknowledge`, and `reschedule` must validate the
 * lease token atomically. This prevents two workers from committing the same
 * task after a lease expires or a worker loses ownership.
 */
export interface TaskQueueAdapter {
  /** Enqueue must be idempotent by task id and reject a conflicting payload. */
  enqueue<TPayload>(task: TaskEnvelope<TPayload>): Promise<void>;
  claim<TPayload>(
    options: TaskClaimOptions,
  ): Promise<ClaimedTask<TPayload> | null>;
  heartbeat(
    taskId: string,
    leaseToken: string,
    leaseDurationMs: number,
  ): Promise<boolean>;
  acknowledge(taskId: string, leaseToken: string): Promise<boolean>;
  reschedule(
    taskId: string,
    leaseToken: string,
    options: TaskRescheduleOptions,
  ): Promise<boolean>;
  reject(
    taskId: string,
    leaseToken: string,
    failure: TaskFailure,
  ): Promise<boolean>;
  reclaimExpiredLeases(now?: number): Promise<number>;
  stats(queue?: string): Promise<TaskQueueStats>;
}

export type TaskDisposition =
  | { type: "acknowledge" }
  | {
      type: "retry";
      availableAt?: number | undefined;
      failure?: TaskFailure | undefined;
    }
  | { type: "reject"; failure: TaskFailure };

export interface WorkerTaskContext {
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly signal: AbortSignal;
  readonly leaseLost: Promise<never>;
  heartbeat(): Promise<boolean>;
}

export type WorkerTaskHandler<TPayload = unknown> = (
  task: TaskEnvelope<TPayload>,
  context: WorkerTaskContext,
) => TaskDisposition | Promise<TaskDisposition>;

export interface WorkerOptions<TPayload = unknown> {
  id: string;
  role: WorkerRole;
  queues: readonly string[];
  queue: TaskQueueAdapter;
  handler: WorkerTaskHandler<TPayload>;
  concurrency?: number | undefined;
  leaseDurationMs?: number | undefined;
  heartbeatIntervalMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  tenantId?: string | undefined;
  maxAttempts?: number | undefined;
  /** Receives polling, handler, lease, and acknowledgement failures. */
  onError?:
    | ((error: Error, task?: TaskEnvelope<TPayload>) => void | Promise<void>)
    | undefined;
}

export type WorkerState = "created" | "running" | "stopping" | "stopped";

export interface WorkerStatus {
  id: string;
  role: WorkerRole;
  state: WorkerState;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  lastTaskAt?: number | undefined;
}
