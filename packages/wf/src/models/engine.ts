import type { Logger } from "./logger";
import type { MetricsCollector } from "./metrics";
import type { EventBus } from "./pubsub";
import type { EventStore, WorkflowStore } from "./store";
import type { Step } from "./workflow";

export interface WorkflowEngineConfig<TContext, TInput, TOutput> {
  workflowStore: WorkflowStore<TContext, TInput, TOutput>;
  eventStore: EventStore<TOutput>;
  eventBus: EventBus<TOutput>;
  logger: Logger;
  metrics: MetricsCollector;
  defaultTimeout?: number;
  defaultRetries?: number;
  lockTTL?: number;
  lockRenewInterval?: number;
  maxConcurrentWorkflows?: number;
  workflowTimeout?: number;
  enableHealthCheck?: boolean;
  enableAutoResume?: boolean;
  autoResumeIntervalMs?: number;
}

export interface WorkflowDefinition<TContext, TInput, TOutput> {
  name: string;
  version: number;
  initialContext: TContext;
  steps: Step<TContext, unknown, unknown>[];
  validate?(input: TInput): boolean | Promise<boolean>;
  transform?(output: unknown): TOutput | Promise<TOutput>; // Use TOutput here
  maxExecutionTime?: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
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
