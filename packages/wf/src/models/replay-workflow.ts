import type { ActivityExecutionContext, ActivityRegistry } from "./activity";
import type { WorkflowError } from "./workflow";

export interface ReplayWorkflowDefinition<TInput, TOutput> {
  readonly name: string;
  readonly version: number;
  readonly activityRegistry: ActivityRegistry;
  run(context: ReplayWorkflowContext, input: TInput): Promise<TOutput>;
}

export interface ReplayWorkflowContext {
  readonly workflowId: string;
  readonly runId: string;
  readonly tenantId?: string | undefined;
  activity<TInput, TOutput>(
    name: string,
    input: TInput,
    options?: { version?: number | undefined; queue?: string | undefined },
  ): Promise<TOutput>;
  parallel<TOutput>(
    operations: readonly (() => Promise<TOutput>)[],
  ): Promise<TOutput[]>;
  fanOut<TInput, TOutput>(
    items: readonly TInput[],
    operation: (item: TInput, index: number) => Promise<TOutput>,
  ): Promise<TOutput[]>;
  batch<TInput, TOutput>(
    id: string,
    items: readonly TInput[],
    operation: (item: TInput, index: number) => Promise<TOutput>,
    options?: BatchOptions | undefined,
  ): Promise<BatchResult<TOutput>>;
  sleep(id: string, durationMs: number): Promise<void>;
  waitForEvent<TPayload = unknown>(
    id: string,
    eventName: string,
  ): Promise<TPayload>;
  saga<TOutput>(run: (scope: SagaScope) => Promise<TOutput>): Promise<TOutput>;
}

export interface BatchOptions {
  concurrency?: number | undefined;
}

export interface BatchFailure {
  index: number;
  message: string;
}

export interface BatchResult<TOutput> {
  results: readonly (TOutput | undefined)[];
  failures: readonly BatchFailure[];
  completed: number;
}

export interface SagaCompensation<TOutput> {
  name: string;
  input: (output: TOutput) => unknown;
  version?: number | undefined;
  queue?: string | undefined;
}

export interface SagaScope {
  activity<TInput, TOutput>(
    name: string,
    input: TInput,
    options?: {
      version?: number | undefined;
      queue?: string | undefined;
      compensate?: SagaCompensation<TOutput> | undefined;
    },
  ): Promise<TOutput>;
  compensate(action: () => Promise<void>): void;
}

export interface ActivityTaskPayload<TInput = unknown> {
  activityId: string;
  activityName: string;
  activityVersion: number;
  input: TInput;
}

export type ReplayWorkflowStatus = "waiting" | "completed" | "failed";

export interface ReplayWorkflowResult<TOutput> {
  workflowId: string;
  runId: string;
  status: ReplayWorkflowStatus;
  output?: TOutput | undefined;
  error?: WorkflowError | undefined;
}

export interface ActivityWorkerOptions {
  id: string;
  queue: import("./worker").TaskQueueAdapter;
  registry: ActivityRegistry;
  history: import("./history").WorkflowHistoryStore;
  logger?: import("./logger").Logger | undefined;
  metrics?: import("./metrics").MetricsCollector | undefined;
  onWorkflowReady?:
    | ((workflowId: string, runId: string) => void | Promise<void>)
    | undefined;
  concurrency?: number | undefined;
  leaseDurationMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  tenantId?: string | undefined;
  onError?: ((error: Error) => void | Promise<void>) | undefined;
}

export interface TimerWorkerOptions {
  id: string;
  queue: import("./worker").TaskQueueAdapter;
  history: import("./history").WorkflowHistoryStore;
  onWorkflowReady?:
    | ((workflowId: string, runId: string) => void | Promise<void>)
    | undefined;
  concurrency?: number | undefined;
  leaseDurationMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  tenantId?: string | undefined;
  onError?: ((error: Error) => void | Promise<void>) | undefined;
}

export interface TimerTaskPayload {
  timerId: string;
  fireAt: number;
}

export interface ReplayWorkflowRunnerOptions {
  queue?: string | undefined;
  tenantId?: string | undefined;
  maxAppendRetries?: number | undefined;
  workflowId?: string | undefined;
  runId?: string | undefined;
}

export type ActivityRunnerContext = ActivityExecutionContext;
