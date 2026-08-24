import type {
  Step,
  Workflow,
  WorkflowEvent,
  WorkflowEventType,
} from "./workflow";

/** Names emitted by the runtime hook system. Event names are also hook names. */
export type WorkflowHookName =
  | WorkflowEventType
  | "engine.started"
  | "engine.shutdown"
  | "workflow.created"
  | "workflow.deleted";

export interface WorkflowHookContext<TContext, TInput, TOutput> {
  readonly name: WorkflowHookName;
  readonly timestamp: number;
  readonly workflowId?: string;
  /** A read-only runtime snapshot when the hook was emitted for a workflow. */
  readonly workflow?: Readonly<Workflow<TContext, TInput, TOutput>>;
  readonly event?: Readonly<WorkflowEvent<TOutput>>;
  readonly step?: Readonly<Step<TContext, unknown, unknown>>;
  readonly signal?: AbortSignal;
  readonly error?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type WorkflowHookHandler<TContext, TInput, TOutput> = (
  context: WorkflowHookContext<TContext, TInput, TOutput>,
) => void | Promise<void>;

export interface WorkflowHookRegistrationOptions {
  /** Higher priority handlers run first. Defaults to 0. */
  priority?: number;
  /** Remove the handler after its first invocation. */
  once?: boolean;
}

export interface WorkflowHookErrorContext<
  TContext,
  TInput,
  TOutput,
> extends WorkflowHookContext<TContext, TInput, TOutput> {
  readonly registrationId: string;
}

export interface WorkflowHookManagerOptions<TContext, TInput, TOutput> {
  /**
   * Receives hook failures. Hook failures are isolated from workflow execution
   * by default; set `failFast` to rethrow after this callback completes.
   */
  onError?: (
    error: unknown,
    context: WorkflowHookErrorContext<TContext, TInput, TOutput>,
  ) => void | Promise<void>;
  /** Make a hook failure fail the operation that emitted the hook. */
  failFast?: boolean;
}
