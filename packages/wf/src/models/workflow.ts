import type { Logger } from "./logger";
import type { MetricsCollector } from "./metrics";

export type WorkflowState =
  | "pending"
  | "running"
  | "paused"
  | "failed"
  | "completed";

export type WorkflowEventType =
  | "workflow.started"
  | "workflow.step.started"
  | "workflow.step.yielded"
  | "workflow.step.completed"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.paused"
  | "workflow.waiting"
  | "workflow.resumed"
  | "workflow.retrying";

export type ErrorType =
  | "transient"
  | "permanent"
  | "timeout"
  | "validation"
  | "unknown";

export interface WorkflowError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  code?: string | undefined;
  stack?: string | undefined;
  timestamp: number;
}

export interface Workflow<TContext, TInput, TOutput> {
  id: string;
  version: number;
  state: WorkflowState;
  steps: Step<TContext, unknown, unknown>[];
  currentStep: number;
  context: TContext;
  input: TInput;
  output?: TOutput | undefined;
  error?: WorkflowError | undefined;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | undefined;
  resumeAt?: number | undefined;
  maxExecutionTime?: number | undefined;
  executionStartedAt?: number | undefined;
  retryCount: number;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
}

export type StepResultType = "chunk" | "complete" | "error" | "wait";

export type StepResult<TOutput> =
  | { type: "chunk"; data: TOutput }
  | { type: "complete"; data: TOutput }
  | {
      type: "wait";
      until: number;
      data?: TOutput | undefined;
      resumeCurrentStep?: boolean;
    }
  | { type: "error"; error: WorkflowError };

export interface Step<TContext, TInput, TOutput> {
  id: string;
  name: string;
  retries?: number | undefined;
  timeout?: number | undefined;
  backoff?: ((attempt: number) => number) | undefined;
  errorClassifier?: ((error: Error) => ErrorType) | undefined;
  compensation?:
    | ((input: TInput, ctx: WorkflowContext<TContext>) => Promise<void>)
    | undefined;
  run(
    input: TInput,
    ctx: WorkflowContext<TContext>,
  ):
    | Promise<StepResult<TOutput>>
    | AsyncGenerator<StepResult<TOutput>, StepResult<TOutput>, unknown>;
}

export interface WorkflowContext<TContext> {
  /** Aborts when the workflow is cancelled or the host is shutting down. */
  readonly signal: AbortSignal;
  readonly workflow: {
    readonly id: string;
    readonly state: WorkflowState;
    readonly currentStep: number;
    readonly version: number;
  };
  readonly data: TContext;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  updateContext(updates: Partial<TContext>): void;
  appendSteps(steps: readonly Step<TContext, unknown, unknown>[]): void;
  abort(reason: string, errorType?: ErrorType): void;
}

export type WorkflowEventPayload<TOutput> =
  | { type: "started"; workflowId: string; version: number }
  | { type: "step.started"; stepId: string; stepName: string; attempt: number }
  | { type: "step.yielded"; stepId: string; data: TOutput }
  | { type: "step.completed"; stepId: string; data: TOutput; duration: number }
  | { type: "completed"; output: TOutput; duration: number }
  | { type: "failed"; error: WorkflowError }
  | { type: "paused"; stepId: string }
  | { type: "waiting"; stepId: string; resumeAt: number }
  | { type: "resumed"; stepId: string }
  | { type: "retrying"; stepId: string; attempt: number; delay: number };

export interface WorkflowEvent<TOutput> {
  id: string;
  workflowId: string;
  timestamp: number;
  eventType: WorkflowEventType;
  payload: WorkflowEventPayload<TOutput>;
  correlationId?: string | undefined;
}
