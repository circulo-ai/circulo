import type {
  ReplayWorkflowDefinition,
  ReplayWorkflowResult,
} from "./replay-workflow";
import type { TokenBucketRateLimiter } from "../limits/token-bucket-rate-limiter";

export interface WorkflowRunReference {
  workflowId: string;
  runId: string;
  tenantId?: string | undefined;
}

export interface IdempotencyClaim {
  claimed: boolean;
  reference: WorkflowRunReference;
  conflict?: boolean | undefined;
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key ${key} was reused with a different payload`);
    this.name = "IdempotencyConflictError";
  }
}

/** Atomic, durable in production, duplicate-run coalescing contract. */
export interface IdempotencyStore {
  claim(
    key: string,
    reference: WorkflowRunReference,
    expiresAt?: number | undefined,
    fingerprint?: string | undefined,
  ): Promise<IdempotencyClaim>;
  release(key: string, reference: WorkflowRunReference): Promise<boolean>;
  clearExpired(now?: number): Promise<number>;
}

export interface WorkflowTrigger<TEvent, TInput, TOutput> {
  id: string;
  eventName: string;
  workflow: ReplayWorkflowDefinition<TInput, TOutput>;
  input: (event: WorkflowEventEnvelope<TEvent>) => TInput;
  filter?: ((event: WorkflowEventEnvelope<TEvent>) => boolean | Promise<boolean>) | undefined;
  idempotencyKey?:
    | ((event: WorkflowEventEnvelope<TEvent>) => string)
    | undefined;
}

export interface WorkflowEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventName: string;
  payload: TPayload;
  tenantId?: string | undefined;
  timestamp: number;
  headers?: Readonly<Record<string, string>> | undefined;
}

export interface WebhookRequest {
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
}

export interface WebhookOptions {
  secret: string;
  signatureHeader?: string | undefined;
  timestampHeader?: string | undefined;
  maxAgeMs?: number | undefined;
}

export interface WorkflowEventGatewayOptions {
  idempotency?: IdempotencyStore | undefined;
  idempotencyTtlMs?: number | undefined;
  rateLimiter?: TokenBucketRateLimiter | undefined;
  duplicateWaitTimeoutMs?: number | undefined;
  duplicatePollIntervalMs?: number | undefined;
}

export interface WorkflowQueryView {
  workflowId: string;
  runId: string;
  tenantId?: string | undefined;
  status: "running" | "waiting" | "completed" | "failed";
  historyLength: number;
  pendingActivities: readonly string[];
  waitingForEvents: readonly string[];
  output?: unknown;
  error?: unknown;
  updatedAt: number;
}

export interface WorkflowTriggerResult<TOutput> {
  reference: WorkflowRunReference;
  result: Promise<ReplayWorkflowResult<TOutput>>;
}
