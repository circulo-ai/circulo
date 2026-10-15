/** Batch UI notifications at 20 Hz while the SDK retains every stream chunk. */
export const CHAT_STREAM_THROTTLE_MS = 50;

export function latestWorkflowTrace(
  parts: Array<{ type: string; data?: unknown }>,
): import("./types").WorkflowTrace | undefined {
  return [...parts].reverse().find((part) => part.type === "data-workflowTrace")
    ?.data as import("./types").WorkflowTrace | undefined;
}
