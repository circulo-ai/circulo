const signals = new Map<string, AbortSignal>();
export function getHarnessSignal(workflowId: string): AbortSignal | undefined {
  return signals.get(workflowId);
}

/** Keep the workflow engine's live cancellation signal out of serialized input. */
export async function withHarnessSignal<T>(
  workflowId: string,
  signal: AbortSignal,
  execute: () => Promise<T>,
): Promise<T> {
  signals.set(workflowId, signal);
  try {
    return await execute();
  } finally {
    if (signals.get(workflowId) === signal) signals.delete(workflowId);
  }
}
