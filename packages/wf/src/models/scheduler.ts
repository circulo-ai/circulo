export interface ScheduleDefinition<TInput = unknown> {
  scheduleId: string;
  cron: string;
  workflowName: string;
  input: TInput;
  tenantId?: string | undefined;
  enabled?: boolean | undefined;
  timeZone?: "UTC" | undefined;
}

export interface ScheduleRecord<
  TInput = unknown,
> extends ScheduleDefinition<TInput> {
  nextRunAt: number;
  lastRunAt?: number | undefined;
  version: number;
}

export interface ScheduleLease<TInput = unknown> {
  schedule: ScheduleRecord<TInput>;
  leaseToken: string;
  leasedUntil: number;
}

export interface ScheduleStore<TInput = unknown> {
  upsert(
    schedule: ScheduleDefinition<TInput>,
    now?: number,
  ): Promise<ScheduleRecord<TInput>>;
  get(scheduleId: string): Promise<ScheduleRecord<TInput> | null>;
  remove(scheduleId: string): Promise<boolean>;
  listDue(
    now: number,
    owner: string,
    limit: number,
    leaseMs: number,
  ): Promise<ScheduleLease<TInput>[]>;
  acknowledge(
    lease: ScheduleLease<TInput>,
    nextRunAt: number,
    now?: number,
  ): Promise<boolean>;
  release(lease: ScheduleLease<TInput>): Promise<boolean>;
}

export interface ScheduleDispatch<TInput = unknown> {
  schedule: ScheduleRecord<TInput>;
  scheduledFor: number;
}

export interface ScheduleWorkerOptions {
  /** Stable owner identity. A value is generated when omitted. */
  workerId?: string | undefined;
  pollIntervalMs?: number | undefined;
  leaseMs?: number | undefined;
  batchSize?: number | undefined;
  concurrency?: number | undefined;
  signal?: AbortSignal | undefined;
  onDispatch: (dispatch: ScheduleDispatch<unknown>) => Promise<void>;
  onError?: ((error: Error) => void | Promise<void>) | undefined;
}

export interface ScheduleWorkerStatus {
  state: "idle" | "running" | "stopping" | "stopped";
  activeDispatches: number;
  lastPollAt?: number | undefined;
}
