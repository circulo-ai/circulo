import { DurableAgent } from "@workflow/ai/agent";
import { convertToModelMessages, UIMessage, UIMessageChunk } from "ai";
import { getWritable } from "workflow";

export async function chat(messages: UIMessage[]) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  step1();

  const agent = new DurableAgent({
    tools: {},
    model: "google/gemini-2.5-flash",
    system: `You are a helpful assistant.`,
  });

  await agent.stream({
    messages: convertToModelMessages(messages),
    writable,
  });
}

async function step1() {
  "use step";

  console.log("hello");
}
