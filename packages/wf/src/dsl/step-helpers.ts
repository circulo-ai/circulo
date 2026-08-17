import type { ErrorType, StepResult, WorkflowError } from "../models/workflow";

export function complete<T>(data: T): StepResult<T> {
  return { type: "complete", data };
}

export function chunk<T>(data: T): StepResult<T> {
  return { type: "chunk", data };
}

export function waitUntil<T>(until: number, data?: T): StepResult<T> {
  if (!Number.isFinite(until) || until < 0) {
    throw new RangeError(
      "waitUntil() requires a finite, non-negative timestamp",
    );
  }
  return { type: "wait", until, data };
}

/** Wait and execute the same step again when the durable timer resumes. */
export function waitUntilAndRetry<T>(until: number, data?: T): StepResult<T> {
  if (!Number.isFinite(until) || until < 0) {
    throw new RangeError(
      "waitUntilAndRetry() requires a finite, non-negative timestamp",
    );
  }
  return { type: "wait", until, data, resumeCurrentStep: true };
}

export function waitForAndRetry<T>(ms: number, data?: T): StepResult<T> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(
      "waitForAndRetry() requires a finite, non-negative duration",
    );
  }
  return waitUntilAndRetry(Date.now() + ms, data);
}

export function waitFor<T>(ms: number, data?: T): StepResult<T> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError("waitFor() requires a finite, non-negative duration");
  }
  return waitUntil(Date.now() + ms, data);
}

export function error(
  message: string,
  errorType: ErrorType = "unknown",
  retryable = false,
): StepResult<never> {
  const workflowError: WorkflowError = {
    type: errorType,
    message,
    retryable,
    timestamp: Date.now(),
  };
  return { type: "error", error: workflowError };
}

export async function* streamStep<T>(
  items: readonly T[],
): AsyncGenerator<StepResult<T>, StepResult<T>, unknown> {
  if (items.length === 0) {
    throw new RangeError("streamStep() requires at least one item");
  }

  for (const item of items) {
    yield chunk(item);
  }
  return complete(items[items.length - 1]!);
}

export function classifyNetworkError(err: unknown): ErrorType {
  const message = errorMessage(err).toLowerCase();
  if (message.includes("econnrefused") || message.includes("enotfound")) {
    return "transient";
  }
  if (message.includes("timeout") || message.includes("etimedout")) {
    return "timeout";
  }
  return "unknown";
}

export function classifyValidationError(err: unknown): ErrorType {
  const message = errorMessage(err).toLowerCase();
  if (message.includes("validation") || message.includes("invalid")) {
    return "validation";
  }
  return "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
