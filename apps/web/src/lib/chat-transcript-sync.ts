import type { ChatMessage } from "./types";
function workflow(message: ChatMessage): string | undefined {
  if (message.role !== "assistant") return;
  for (const part of message.parts) {
    if (part.type === "data-workflowTrace" && part.data?.workflowId)
      return part.data.workflowId;
    if (part.type === "data-workflowStarted" && part.data?.workflowId)
      return part.data.workflowId;
  }
}

/** Idle refresh preserves loaded history and replaces a streamed reply with
 * its canonical persisted identity instead of appending a duplicate. */
export function reconcileIdleTranscript(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(incoming.map((message) => [message.id, message]));
  const byWorkflow = new Map(
    incoming
      .filter((message) => workflow(message))
      .map((message) => [workflow(message)!, message]),
  );
  const seen = new Set<string>();
  const identity = (message: ChatMessage) =>
    workflow(message)
      ? `workflow:${workflow(message)}`
      : `message:${message.id}`;
  const result: ChatMessage[] = [];
  for (const message of current) {
    const stored =
      byId.get(message.id) ??
      (workflow(message) ? byWorkflow.get(workflow(message)!) : undefined);
    const next =
      stored && JSON.stringify(stored) !== JSON.stringify(message)
        ? stored
        : message;
    if (!seen.has(identity(next))) {
      seen.add(identity(next));
      result.push(next);
    }
  }
  for (const message of incoming) {
    if (!seen.has(identity(message))) {
      seen.add(identity(message));
      result.push(message);
    }
  }
  result.sort((a, b) => {
    const left = Date.parse(String(a.metadata?.createdAt ?? ""));
    const right = Date.parse(String(b.metadata?.createdAt ?? ""));
    return Number.isFinite(left) && Number.isFinite(right) ? left - right : 0;
  });
  return result.length === current.length &&
    result.every((message, index) => message === current[index])
    ? current
    : result;
}
