import { UIMessage, type UIMessageChunk } from "ai";
import { getWritable } from "workflow";
import { endStream, startStream, streamResponse, persistAssistant } from "./steps";
import { createLogger } from "@/lib/logs/console/logger";

const logger = createLogger("ChatWorkflow")

const MAX_STEPS = 5;

/**
 * Chat workflow
 * Streams model responses and persists assistant messages
 * even if the HTTP connection closes.
 */
export async function chat(messages: UIMessage[], chatId?: string, userId?: string) {
  "use workflow";

  // Writable stream for real-time UI updates
  const writable = getWritable<UIMessageChunk>();

  const messageId = await startStream(writable);

  const { text } = await streamResponse(messages, writable);

  await endStream(writable);

  // Persist assistant response via API to keep workflow bundle clean
  if (chatId && userId && text.trim().length > 0) {
    await persistAssistant(chatId, userId, text, messageId);
  }

  return {
    messages,
  };
}
