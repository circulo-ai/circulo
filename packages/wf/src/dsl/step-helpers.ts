import type { ErrorType, StepResult, WorkflowError } from "../models/workflow";

export function complete<T>(data: T): StepResult<T> {
  return { type: "complete", data };
}

export function chunk<T>(data: T): StepResult<T> {
  return { type: "chunk", data };
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
  items: T[],
): AsyncGenerator<StepResult<T>, StepResult<T>, unknown> {
  for (const item of items) {
    yield chunk(item);
  }
  return complete(items[items.length - 1] as T);
}

export function classifyNetworkError(err: Error): ErrorType {
  const message = err.message.toLowerCase();
  if (message.includes("econnrefused") || message.includes("enotfound")) {
    return "transient";
  }
  if (message.includes("timeout") || message.includes("etimedout")) {
    return "timeout";
  }
  return "unknown";
}

export function classifyValidationError(err: Error): ErrorType {
  const message = err.message.toLowerCase();
  if (message.includes("validation") || message.includes("invalid")) {
    return "validation";
  }
  return "unknown";
}
