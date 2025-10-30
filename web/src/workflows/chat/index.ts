import { DurableAgent } from "@workflow/ai/agent";
import { convertToModelMessages, UIMessage, UIMessageChunk } from "ai";
import { getWritable } from "workflow";

export async function chat(messages: UIMessage[]) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const agent = new DurableAgent({
    tools: {},
    model: "gemini-2.5-flash",
    system: `You are a helpful assistant.`,
  });

  await agent.stream({
    messages: convertToModelMessages(messages),
    writable,
  });
}
