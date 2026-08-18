import type { Logger } from "./logger";
import type { MetricsCollector } from "./metrics";
import type { EventBus } from "./pubsub";
import type { EventStore, WorkflowStore } from "./store";
import type { Step } from "./workflow";
import type { WorkflowHookManager } from "../hooks/workflow-hooks";

export interface WorkflowEngineConfig<TContext, TInput, TOutput> {
  workflowStore: WorkflowStore<TContext, TInput, TOutput>;
  eventStore: EventStore<TOutput>;
  eventBus: EventBus<TOutput>;
  logger?: Logger | undefined;
  metrics?: MetricsCollector | undefined;
  defaultTimeout?: number | undefined;
  defaultRetries?: number | undefined;
  lockTTL?: number | undefined;
  lockRenewInterval?: number | undefined;
  maxConcurrentWorkflows?: number | undefined;
  workflowTimeout?: number | undefined;
  enableHealthCheck?: boolean | undefined;
  enableAutoResume?: boolean | undefined;
  autoResumeIntervalMs?: number | undefined;
  /** Optional lifecycle hooks. Hook failures are isolated by default. */
  hooks?: WorkflowHookManager<TContext, TInput, TOutput> | undefined;
}

export interface WorkflowDefinition<TContext, TInput, TOutput> {
  name: string;
  version: number;
  initialContext: TContext;
  steps: Step<TContext, unknown, unknown>[];
  validate?(input: TInput): boolean | Promise<boolean>;
  /**
   * A runtime-only output transform. Functions are intentionally not persisted
   * with a workflow, so callers that resume work in another process should
   * pass the transform to `engine.run` instead.
   */
  transform?(output: TOutput): TOutput | Promise<TOutput>;
  maxExecutionTime?: number | undefined;
  tags?: Record<string, string> | undefined;
  metadata?: Record<string, unknown> | undefined;
  idempotencyKey?: string | undefined;
}

export interface HealthCheck {
  healthy: boolean;
  details: {
    activeWorkflows: number;
    queuedWorkflows: number;
    failedWorkflows: number;
    lastCheck: number;
  };
}
