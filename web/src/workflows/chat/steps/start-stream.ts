import { generateId } from "@/lib/server-utils";
import { UIMessageChunk } from "ai";

export async function startStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  const writer = writable.getWriter();
  const messageId = generateId();

  // Send start message
  await writer.write({
    type: "start",
    messageMetadata: {
      createdAt: Date.now(),
      messageId: messageId,
    },
  });

  writer.releaseLock();

  return messageId;
}
