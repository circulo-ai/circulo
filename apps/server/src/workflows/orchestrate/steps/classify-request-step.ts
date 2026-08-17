import { type Message } from "@/db";
import { getLanguageModel } from "@/lib/ai/providers";
import { type ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import { type OrchestrationInput } from "@/workflows/orchestrate/types";
import { generateText, Output } from "ai";
import { z } from "zod";

const classificationSchema = z.object({
  intent: z.enum([
    "question",
    "task",
    "analysis",
    "creation",
    "modification",
    "automation",
    "monitoring",
    "webhook_response",
  ]),
  complexity: z.enum(["simple", "moderate", "complex", "multi_stage"]),
  domains: z
    .array(z.string())
    .describe("Technical domains involved (e.g., 'code', 'data', 'design')"),
  requiresMultipleAgents: z.boolean(),
  estimatedSteps: z.number(),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  notifyMembers: z
    .boolean()
    .describe("Whether to notify chat members when complete"),
  keyEntities: z
    .array(z.string())
    .describe("Key entities mentioned (files, repos, users, etc.)"),
  reasoning: z.string(),
});

export type RequestClassification = z.infer<typeof classificationSchema>;

export async function classifyRequestStep(params: {
  inputMessages: ChatMessage[];
  messages: Message[];
  triggerType: OrchestrationInput["triggerType"];
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<RequestClassification> {
  const {
    inputMessages: message,
    messages,
    triggerType,
    webhookPayload,
  } = params;

  let prompt = getTextFromMessages(message);

  // Enhance prompt with webhook context
  if (triggerType === "webhook_event" && webhookPayload) {
    prompt = `WEBHOOK EVENT RECEIVED:
Source: ${webhookPayload.source}
Event: ${webhookPayload.event}
Data: ${JSON.stringify(webhookPayload.data, null, 2)}

User Message: ${getTextFromMessages(message)}`;
  }

  // Get recent conversation context (last 10 messages)
  const recentMessages = messages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
    author: m.authorType,
  }));

  const { output } = await generateText({
    model: getLanguageModel(),
    output: Output.object({ schema: classificationSchema }),
    system: `You are an intelligent request classifier for a multi-agent orchestration system.

Analyze the user's request and conversation history to determine:
1. The primary intent (what they want to accomplish)
2. Complexity level (how many steps/agents needed)
3. Technical domains involved
4. Whether multiple specialized agents are needed
5. Estimated number of execution steps
6. Urgency level
7. Whether chat members should be notified
8. Key entities (repositories, files, users, etc.)

Context:
- This is ${triggerType === "webhook_event" ? "a webhook-triggered automation" : "a direct user request"}
- Consider the conversation history for context
- Be precise in domain identification for better agent matching`,
    prompt: `Recent conversation:
${recentMessages.map((m) => `${m.author}: ${m.content}`).join("\n")}

Current request:
${prompt}

Classify this request thoroughly.`,
  });

  return output;
}
