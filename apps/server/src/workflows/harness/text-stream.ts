/** Tool errors can be corrected in later model steps. Only a terminal stream
 * error should replace the final outcome with a provider failure. */
export async function consumeAgentText(
  stream: AsyncIterable<{ type: string; text?: string; error?: unknown }>,
  onText: (text: string) => void,
): Promise<unknown> {
  let failure: unknown;
  for await (const part of stream) {
    if (part.type === "error") failure = part.error;
    else if (part.type === "text-delta" && typeof part.text === "string")
      onText(part.text);
  }
  return failure;
}
