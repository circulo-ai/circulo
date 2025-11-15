import { db, chatAgent } from "@/db";
import { agentRepo } from "@/db/repositories/agent-repo";
import { eq } from "drizzle-orm";

/**
 * Resolve or create an assistant agent for a chat and return its id.
 * - If the chat already has agents, use the first by speak order.
 * - Otherwise, create a default "Assistant" agent for the user and link it.
 */
export async function getAssistantAgentId(chatId: string, userId: unknown): Promise<string> {
  // Try existing chat agents
  const existingAgents = await db.query.chatAgent.findMany({
    where: eq(chatAgent.chatId, chatId),
  });
  if (existingAgents.length > 0) {
    const first = existingAgents.sort((a, b) => (a.speakOrder ?? 0) - (b.speakOrder ?? 0))[0];
    return first.agentId;
  }

  // Coerce userId to string if an object was passed
  const userIdStr = typeof userId === "string"
    ? userId
    : (userId && typeof userId === "object" && (userId as any).id
        ? String((userId as any).id)
        : (() => { throw new Error("Invalid userId provided to getAssistantAgentId"); })());

  // Create a simple default agent for this user
  const newAgent = await agentRepo.create({
    id: crypto.randomUUID(),
    userId: userIdStr,
    name: "Assistant",
    systemPrompt: "You are a helpful assistant.",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  // Link the agent to the chat with speakOrder 0
  await db
    .insert(chatAgent)
    .values({
      id: crypto.randomUUID(),
      chatId,
      agentId: newAgent.id,
      speakOrder: 0,
      enabled: true,
      addedBy: userIdStr,
    })
    // Avoid duplicate links if concurrent calls happen
    .onConflictDoNothing({ target: [chatAgent.chatId, chatAgent.agentId] });

  return newAgent.id;
}
