import type { Logger } from "./logger";
import type { MetricsCollector } from "./metrics";
import type { ErrorType } from "./workflow";

export interface ActivityRetryPolicy {
  maxAttempts: number;
  initialDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
  multiplier?: number | undefined;
  jitter?: number | undefined;
  nonRetryableErrorTypes?: readonly ErrorType[] | undefined;
}

export interface ActivityExecutionContext {
  readonly activityId: string;
  readonly activityName: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly tenantId?: string | undefined;
  readonly attempt: number;
  readonly signal: AbortSignal;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  readonly traceContext?: Readonly<Record<string, string>> | undefined;
  heartbeat(): Promise<boolean>;
}

export interface ActivityDefinition<TInput, TOutput> {
  readonly name: string;
  readonly version: number;
  readonly retryPolicy: ActivityRetryPolicy;
  run(input: TInput, context: ActivityExecutionContext): Promise<TOutput>;
}

export interface ActivityRegistry {
  register<TInput, TOutput>(
    definition: ActivityDefinition<TInput, TOutput>,
  ): void;
  get<TInput, TOutput>(
    name: string,
    version?: number,
  ): ActivityDefinition<TInput, TOutput> | undefined;
  list(): readonly ActivityDefinition<unknown, unknown>[];
}
