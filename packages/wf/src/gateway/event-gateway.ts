import { generateId } from "../utils/id";
import type {
  IdempotencyStore,
  ReplayWorkflowRunnerOptions,
  WebhookOptions,
  WebhookRequest,
  WorkflowEventEnvelope,
  WorkflowEventGatewayOptions,
  WorkflowRunReference,
  WorkflowTrigger,
  WorkflowTriggerResult,
} from "../models";
import { IdempotencyConflictError, RateLimitExceededError } from "../models";
import { ReplayWorkflowRunner } from "../durable/replay-workflow-runner";
import { InMemoryIdempotencyStore } from "./idempotency-store";
import { WorkflowReplayError } from "../replay/replay-cursor";

export class WorkflowEventGateway {
  private readonly triggers = new Map<string, WorkflowTrigger<unknown, unknown, unknown>[]>();
  private readonly inFlight = new Map<string, Promise<import("../models").ReplayWorkflowResult<unknown>>>();
  private readonly idempotency: IdempotencyStore;
  private readonly rateLimiter: import("../limits/token-bucket-rate-limiter").TokenBucketRateLimiter | undefined;
  private readonly duplicateWaitTimeoutMs: number;
  private readonly duplicatePollIntervalMs: number;

  constructor(
    private readonly runner: ReplayWorkflowRunner,
    options: WorkflowEventGatewayOptions = {},
  ) {
    this.idempotency = options.idempotency ?? new InMemoryIdempotencyStore();
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? 24 * 60 * 60 * 1000;
    this.rateLimiter = options.rateLimiter;
    this.duplicateWaitTimeoutMs = options.duplicateWaitTimeoutMs ?? 10_000;
    this.duplicatePollIntervalMs = options.duplicatePollIntervalMs ?? 25;
    if (this.duplicateWaitTimeoutMs < 0 || this.duplicatePollIntervalMs < 1) {
      throw new RangeError("Duplicate wait timing must be non-negative with a positive poll interval");
    }
  }

  private readonly idempotencyTtlMs: number;

  register<TEvent, TInput, TOutput>(
    trigger: WorkflowTrigger<TEvent, TInput, TOutput>,
  ): () => void {
    if (!trigger.id.trim() || !trigger.eventName.trim()) {
      throw new Error("Trigger id and eventName must not be empty");
    }
    const list = this.triggers.get(trigger.eventName) ?? [];
    if (list.some((item) => item.id === trigger.id)) {
      throw new Error(`Trigger ${trigger.id} is already registered`);
    }
    list.push(trigger as WorkflowTrigger<unknown, unknown, unknown>);
    this.triggers.set(trigger.eventName, list);
    return () => {
      const current = this.triggers.get(trigger.eventName);
      if (!current) return;
      const remaining = current.filter((item) => item.id !== trigger.id);
      if (remaining.length === 0) this.triggers.delete(trigger.eventName);
      else this.triggers.set(trigger.eventName, remaining);
    };
  }

  async dispatch<TPayload>(
    event: WorkflowEventEnvelope<TPayload>,
  ): Promise<WorkflowTriggerResult<unknown>[]> {
    const triggers = this.triggers.get(event.eventName) ?? [];
    const results: WorkflowTriggerResult<unknown>[] = [];
    for (const trigger of triggers) {
      if (trigger.filter && !(await trigger.filter(event))) continue;
      if (this.rateLimiter) {
        const decision = await this.rateLimiter.take({
          key: `trigger:${trigger.id}:${event.tenantId ?? "_"}`,
        });
        if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterMs);
      }
      const key = trigger.idempotencyKey
        ? `${trigger.id}:${event.tenantId ?? "_"}:${trigger.idempotencyKey(event)}`
        : `${trigger.id}:${event.tenantId ?? "_"}:${event.eventId}`;
      const candidate: WorkflowRunReference = {
        workflowId: generateId("workflow"),
        runId: generateId("run"),
        ...(event.tenantId === undefined ? {} : { tenantId: event.tenantId }),
      };
      const claim = await this.idempotency.claim(
        key,
        candidate,
        Date.now() + this.idempotencyTtlMs,
        stableFingerprint({
          eventName: event.eventName,
          tenantId: event.tenantId,
          payload: event.payload,
        }),
      );
      if (claim.conflict) throw new IdempotencyConflictError(key);
      const reference = claim.reference;
      const runnerOptions: ReplayWorkflowRunnerOptions = {
        ...(event.tenantId === undefined ? {} : { tenantId: event.tenantId }),
        workflowId: reference.workflowId,
        runId: reference.runId,
      };
      let result: Promise<import("../models").ReplayWorkflowResult<unknown>>;
      if (claim.claimed) {
        result = this.runner.start(
            trigger.workflow,
            trigger.input(event),
            runnerOptions,
          );
        this.inFlight.set(key, result);
        void result.then(
          () => this.inFlight.delete(key),
          () => this.inFlight.delete(key),
        );
      } else {
        result = this.inFlight.get(key) ?? this.runExisting(
          trigger.workflow,
          reference.workflowId,
          reference.runId,
          runnerOptions,
        );
      }
      results.push({ reference, result });
    }
    return results;
  }

  async handleWebhook<TPayload>(
    eventName: string,
    request: WebhookRequest,
    options: WebhookOptions,
  ): Promise<WorkflowTriggerResult<unknown>[]> {
    await verifyWebhook(request, options);
    const payload = JSON.parse(request.body) as TPayload;
    return this.dispatch({
      eventId: request.headers["x-event-id"] ?? generateId("event"),
      eventName,
      payload,
      timestamp: Date.now(),
      headers: Object.fromEntries(
        Object.entries(request.headers).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    });
  }

  private async runExisting<TInput, TOutput>(
    workflow: import("../models").ReplayWorkflowDefinition<TInput, TOutput>,
    workflowId: string,
    runId: string,
    options: ReplayWorkflowRunnerOptions,
  ): Promise<import("../models").ReplayWorkflowResult<TOutput>> {
    const deadline = Date.now() + this.duplicateWaitTimeoutMs;
    while (true) {
      try {
        return await this.runner.run(workflow, workflowId, runId, options);
      } catch (cause) {
        if (
          !(cause instanceof WorkflowReplayError) ||
          !cause.message.includes("history is exhausted") ||
          Date.now() >= deadline
        ) {
          throw cause;
        }
        await wait(this.duplicatePollIntervalMs);
      }
    }
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function stableFingerprint(value: unknown): string {
  return JSON.stringify(sortValue(value)) ?? "undefined";
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

async function verifyWebhook(
  request: WebhookRequest,
  options: WebhookOptions,
): Promise<void> {
  if (!options.secret) throw new Error("Webhook secret must not be empty");
  const signatureHeader = options.signatureHeader ?? "x-wf-signature";
  const timestampHeader = options.timestampHeader ?? "x-wf-timestamp";
  const signature = request.headers[signatureHeader];
  const timestamp = request.headers[timestampHeader];
  if (!signature || !timestamp) throw new Error("Webhook signature is missing");
  const timestampMs = Number(timestamp);
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxAgeMs) {
    throw new Error("Webhook timestamp is outside the allowed window");
  }
  const expected = await hmacHex(options.secret, `${timestamp}.${request.body}`);
  const normalized = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  if (!constantTimeEqual(normalized, expected)) {
    throw new Error("Webhook signature is invalid");
  }
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto API is required for webhook verification");
  const key = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await cryptoApi.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
