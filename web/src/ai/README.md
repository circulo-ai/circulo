Summary: Agent Tool System
Architecture Overview
┌─────────────────────────────────────────────────────────────┐
│ Tool Registry │
│ - Registers tool definitions at import time │
│ - Validates env vars and config │
│ - Creates runtime tool instances │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ Tool Loader │
│ - Loads agent's tool configs from DB │
│ - Resolves env vars (org → user → chat → instance)         │
│ - Creates runtime tools with resolved context │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ Agent Factory │
│ - Resolves agent entity (with chat overrides)              │
│ - Loads all configured tools │
│ - Returns RuntimeAgent ready for execution │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ Agent Runner │
│ - Executes agent with tool loop │
│ - Handles streaming and non-streaming │
│ - Saves responses to database │
└─────────────────────────────────────────────────────────────┘
Files Created
FilePurposelib/ai/tools/registry.tsTool definition & registration systemlib/ai/tools/telegram/index.tsTelegram tools (
send, getUpdates, photo)lib/ai/tools/loader.tsLoads tools with env resolutionlib/ai/tools/index.tsTool catalog &
discoverylib/ai/agents/factory.tsCreates runtime agents from DBlib/ai/agents/runner.tsExecutes agents with tool
loopsapp/api/agents/[agentId]/tools/route.tsAPI for tool configurationrepos/agent-repo.tsAgent database operations
Key Features

Type-safe tool definitions with Zod schemas for parameters and config
Environment variable cascade: Organization → User → Chat → Instance
Chat-level agent overrides for instructions and temperature
Automatic tool validation before execution
Streaming support with real-time tool call notifications
Tool catalog API for frontend discovery

Would you like me to add any additional tools (Discord, HTTP, etc.) or expand on any part of this implementation?

// ==================== EXAMPLE: Complete Agent Execution Flow ====================
// This shows how all the pieces fit together

import { db } from "@/db";
import { agent, agentToolConfig, chatAgent } from "@/db/schema";
import { agentRepo } from "@/db/repositories/agent-repo";
import { runAgent, streamAgent, loadConversationHistory, saveAgentResponse } from "@/lib/ai/agents/runner";
import { toolRegistry } from "@/lib/ai/tools/registry";
import { setUserEnv, setOrgEnv } from "@/utils/environment";

// ==================== 1. SETUP: Create an Agent with Tools ====================

async function setupAgentWithTelegram(organizationId: string, userId: string) {
// Create the agent
const newAgent = await agentRepo.create({
organizationId,
createdBy: userId,
name: "Notification Bot",
description: "Sends notifications via Telegram",
instructions: `You are a helpful assistant that can send Telegram messages.
When asked to notify someone or send a message, use the telegram.sendMessage tool.
Always confirm when a message has been sent successfully.`,
model: "gpt-4o-mini",
maxTokens: 1000,
temperature: 70,
visibility: "team",
});

// Configure the Telegram tool for this agent
await agentRepo.addToolConfig(newAgent.id, {
toolId: "telegram.sendMessage",
toolType: "builtin",
config: {
defaultChatId: "-1001234567890", // Default channel
parseMode: "HTML",
},
// Instance-level env overrides (optional - uses org/user env by default)
envOverrides: {},
});

console.log("Created agent:", newAgent.id);
return newAgent;
}

// ==================== 2. SETUP: Configure Environment Variables ====================

async function setupEnvironment(organizationId: string, userId: string) {
// Set organization-level secrets (shared across all users)
await setOrgEnv(organizationId, {
TELEGRAM_BOT_TOKEN: "your-bot-token-here",
OPENAI_API_KEY: "sk-...",
});

// User can override with their own token if needed
await setUserEnv(userId, {
// TELEGRAM_BOT_TOKEN: "user-specific-token", // Uncomment to override
});

console.log("Environment configured");
}

// ==================== 3. ADD AGENT TO CHAT ====================

async function addAgentToChat(chatId: string, agentId: string, userId: string) {
// Add agent to chat with optional overrides
const [chatAgentRow] = await db
.insert(chatAgent)
.values({
chatId,
agentId,
addedBy: userId,
isEnabled: true,
customInstructions: null, // Or override: "Be more concise in this chat"
customTemperature: null, // Or override: "0.5"
})
.onConflictDoUpdate({
target: [chatAgent.chatId, chatAgent.agentId],
set: { isEnabled: true },
})
.returning();

console.log("Agent added to chat:", chatAgentRow.id);
return chatAgentRow;
}

// ==================== 4. RUN AGENT (Non-streaming) ====================

async function executeAgent(
chatId: string,
agentId: string,
userId: string,
organizationId: string,
userMessage: string
) {
// Load conversation history
const history = await loadConversationHistory(chatId);

// Add new user message
const messages = [
...history,
{ role: "user" as const, content: userMessage },
];

// Run agent with automatic tool execution
const response = await runAgent({
agentId,
chatId,
userId,
organizationId,
messages,
maxSteps: 5, // Max tool call rounds
onToolCall: (name, args) => {
console.log(`Tool called: ${name}`, args);
},
onToolResult: (name, result) => {
console.log(`Tool result: ${name}`, result);
},
});

// Save response to database
const savedMessage = await saveAgentResponse({
chatId,
agentId,
response,
});

console.log("Agent response:", response.content);
console.log("Tools used:", response.toolCalls.map((t) => t.name));
console.log("Tokens used:", response.usage.totalTokens);

return response;
}

// ==================== 5. RUN AGENT (Streaming) ====================

async function executeAgentStreaming(
chatId: string,
agentId: string,
userId: string,
organizationId: string,
userMessage: string
) {
const history = await loadConversationHistory(chatId);
const messages = [...history, { role: "user" as const, content: userMessage }];

const result = await streamAgent({
agentId,
chatId,
userId,
organizationId,
messages,
});

// Stream text chunks
for await (const chunk of result.textStream) {
process.stdout.write(chunk);
}

// Get final result
const finalResult = await result.response;
console.log("\nFinish reason:", finalResult.finishReason);

return finalResult;
}

// ==================== 6. API ROUTE EXAMPLE ====================

// app/api/chat/[chatId]/message/route.ts
import { NextRequest } from "next/server";

export async function POST(
req: NextRequest,
{ params }: { params: { chatId: string } }
) {
const session = await auth();
if (!session?.user) {
return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const { chatId } = params;
const { message, agentId } = await req.json();

// Get chat to determine organization
const chat = await db.query.chat.findFirst({
where: eq(chat.id, chatId),
});

if (!chat) {
return Response.json({ error: "Chat not found" }, { status: 404 });
}

try {
const response = await runAgent({
agentId,
chatId,
userId: session.user.id,
organizationId: chat.organizationId,
messages: [{ role: "user", content: message }],
});

    await saveAgentResponse({ chatId, agentId, response });

    return Response.json({
      content: response.content,
      toolCalls: response.toolCalls,
      usage: response.usage,
    });

} catch (err) {
console.error("Agent execution failed:", err);
return Response.json(
{ error: "Agent execution failed" },
{ status: 500 }
);
}
}

// ==================== 7. STREAMING API ROUTE ====================

// app/api/chat/[chatId]/stream/route.ts
export async function POST(
req: NextRequest,
{ params }: { params: { chatId: string } }
) {
const session = await auth();
if (!session?.user) {
return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const { chatId } = params;
const { message, agentId } = await req.json();

const chat = await db.query.chat.findFirst({
where: eq(chat.id, chatId),
});

if (!chat) {
return Response.json({ error: "Chat not found" }, { status: 404 });
}

const result = await streamAgent({
agentId,
chatId,
userId: session.user.id,
organizationId: chat.organizationId,
messages: [{ role: "user", content: message }],
});

// Return streaming response
return result.toDataStreamResponse();
}