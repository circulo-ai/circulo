import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  generateId,
  streamText,
  UIMessage,
  UIMessageChunk,
} from "ai";

export async function startStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  const writer = writable.getWriter();

  // Send start message
  await writer.write({
    type: "start",
    messageMetadata: {
      createdAt: Date.now(),
      messageId: generateId(),
    },
  });

  writer.releaseLock();
}

export async function streamTextStep(
  messages: UIMessage[],
  writable: WritableStream<UIMessageChunk>,
) {
  "use step";

  const writer = writable.getWriter();

  // Call streamText from the AI SDK
  const result = streamText({
    model: google("gemini-2.5-flash"),
    messages: convertToModelMessages(messages),
    /* other options */
  });

  // Pipe the AI stream into the writable stream
  const reader = result
    .toUIMessageStream({ sendStart: false, sendFinish: false })
    .getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writer.write(value);
  }

  reader.releaseLock();
  writer.releaseLock();

  // Wait for all promises to resolve
  const [finishReason, text, toolCalls, toolResults] = await Promise.all([
    result.finishReason,
    result.text,
    result.toolCalls,
    result.toolResults,
  ]);

  // Create assistant message from the result
  const assistantMessage: UIMessage = {
    id: generateId(),
    role: "assistant",
    parts: [
      {
        type: "text",
        text: text,
      },
    ],
    metadata: {
      createdAt: Date.now(),
    },
  };

  // Add tool calls if present
  //   if (toolCalls && toolCalls.length > 0) {
  //     assistantMessage.toolInvocations = toolCalls.map((call, index) => {
  //       const toolResult = toolResults?.[index];
  //       return {
  //         state: toolResult ? ("result" as const) : ("call" as const),
  //         toolCallId: call.toolCallId,
  //         toolName: call.toolName,
  //         args: call.args,
  //         result: toolResult?.result,
  //       };
  //     });
  //   }

  return {
    message: assistantMessage,
    finishReason,
    text,
  };
}

export async function endStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  const writer = writable.getWriter();

  // Send finish message
  await writer.write({
    type: "finish",
    messageMetadata: {
      finishedAt: Date.now(),
    },
  });

  // Close the stream
  await writer.close();
  writer.releaseLock();
}
