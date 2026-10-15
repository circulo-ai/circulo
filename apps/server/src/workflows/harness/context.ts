import type { ModelMessage } from "ai";

const MAX_TOOL_RESULT_CHARACTERS = 8_000;

/** Keep tool-call/result pairs intact and retain the latest request. Full results
 * remain in the execution journal and can be read in bounded pages. */
export function boundModelContext(
  messages: ModelMessage[],
  limit: number,
): { messages: ModelMessage[]; changed: boolean } {
  let changed = false;
  const bounded = messages.map((message) => {
    if (message.role !== "tool") return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-result") return part;
        const serialized = JSON.stringify(part.output);
        if (serialized.length <= MAX_TOOL_RESULT_CHARACTERS) return part;
        changed = true;
        return {
          ...part,
          output: {
            type: "text" as const,
            value: `${serialized.slice(0, MAX_TOOL_RESULT_CHARACTERS)}\n[Tool result abbreviated. Use readExecutionEvidence with toolCallId ${part.toolCallId} to read the full saved result in pages.]`,
          },
        };
      }),
    };
  });
  const size = (message: ModelMessage) =>
    JSON.stringify(message, (key, value) =>
      ["image", "data"].includes(key) &&
      (typeof value === "string" || value instanceof Uint8Array)
        ? "[binary content budgeted separately]"
        : value,
    ).length;
  const groups: ModelMessage[][] = [];
  for (const message of bounded) {
    if (
      message.role === "tool" &&
      groups.at(-1)?.some((item) => item.role === "assistant")
    )
      groups.at(-1)!.push(message);
    else groups.push([message]);
  }
  const lastUser = groups.reduce(
    (last, group, index) =>
      group.some((message) => message.role === "user") ? index : last,
    -1,
  );
  let total = groups.reduce(
    (count, group) => count + group.reduce((sum, item) => sum + size(item), 0),
    0,
  );
  const kept = groups.filter((group, index) => {
    if (
      total <= limit ||
      index === lastUser ||
      index === groups.length - 1 ||
      group.some((item) => item.role === "system")
    )
      return true;
    total -= group.reduce((sum, item) => sum + size(item), 0);
    changed = true;
    return false;
  });
  if (total > limit)
    throw new Error(
      "The current request exceeds the harness context budget. Reduce source material or use paginated retrieval.",
    );
  return { messages: kept.flat(), changed };
}
