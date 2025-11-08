import { UIMessageChunk } from "ai";

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
