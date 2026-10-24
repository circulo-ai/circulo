import type { ModelMessage } from "ai";

const MAX_TOOL_RESULT_CHARACTERS = 8_000;
const BINARY_CONTEXT_PLACEHOLDER = "[binary content budgeted separately]";

function isSerializedBuffer(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

function isInlineDataUrl(value: string): boolean {
  return /^data:[^,]{1,256},/i.test(value);
}

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
    JSON.stringify(message, (key, value) => {
      // Inline images arrive as data URLs, typed arrays, or Buffers. Buffer's
      // toJSON runs before this replacer and expands it to a byte array, so
      // recognize that serialized shape as well as the original binary types.
      if (
        ArrayBuffer.isView(value) ||
        value instanceof ArrayBuffer ||
        isSerializedBuffer(value)
      )
        return BINARY_CONTEXT_PLACEHOLDER;
      if (
        typeof value === "string" &&
        (["image", "data"].includes(key) || isInlineDataUrl(value))
      )
        return BINARY_CONTEXT_PLACEHOLDER;
      return value;
    }).length;
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
