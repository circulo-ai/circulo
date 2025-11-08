import { UIMessage, type UIMessageChunk } from "ai";
import { getWritable } from "workflow";
import { endStream, startStream, streamTextStep } from "./steps";
// Persistence is handled in the API route to avoid bundler issues in workflows

const MAX_STEPS = 5;

export async function chat(messages: UIMessage[]) {
  "use workflow";

  // Get typed writable stream for UI message chunks
  const writable = getWritable<UIMessageChunk>();

  // Start the stream
  await startStream(writable);

  let currentMessages = [...messages];

  // Process messages in steps
  for (let i = 0; i < MAX_STEPS; i++) {
    const result = await streamTextStep(currentMessages, writable);

    // Add the assistant's message to the conversation
    currentMessages.push(result.message);

  // Persisting assistant messages is handled by the API route after streaming

    // Break if not continuing with tool calls
    if (result.finishReason !== "tool-calls") {
      break;
    }
  }

  // End the stream
  await endStream(writable);

  // Return final messages if needed
  return {
    messages: currentMessages,
  };
}
