import { toolRegistry } from "@/ai/tools/registry";
import { db } from "@/db";
import { agentToolConfig, message, Message, NewMessage } from "@/db/schema";
import { getMergedEnv } from "@/lib/environment/utils";
import { generateText, LanguageModelUsage, ModelMessage, streamText } from "ai";
import { eq } from "drizzle-orm";
import { AgentExecutionContext, createRuntimeAgent } from "./factory";

// ==================== TYPES ====================

export interface RunAgentOptions {
  agentId: string;
  chatId: string;
  userId: string;
  organizationId: string;
  messages: ModelMessage[];
  stream?: boolean;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
}

export interface AgentResponse {
  content: string;
  toolCalls: Array<{
    name: string;
    args: unknown;
    result: unknown;
  }>;
  usage: LanguageModelUsage;
  finishReason: string;
}

// ==================== RUNNER ====================

/**
 * Run an agent with automatic tool execution loop.
 */
export async function runAgent(
  options: RunAgentOptions,
): Promise<AgentResponse> {
  const {
    agentId,
    chatId,
    userId,
    organizationId,
    messages,
    onToolCall,
    onToolResult,
  } = options;

  const context: AgentExecutionContext = {
    chatId,
    userId,
    organizationId,
  };

  const runtimeAgent = await createRuntimeAgent(agentId, context);

  const configs = await db.query.agentToolConfig.findMany({
    where: eq(agentToolConfig.agentId, agentId),
  });
  const enabledConfigs = configs.filter((c) => c.isEnabled);
  const envBase = await getMergedEnv({
    organizationId,
    userId,
    chatId,
  } as any);
  const orderedConfigs = enabledConfigs.slice().sort((a, b) => {
    if (a.toolId === b.toolId) {
      const at = (a as any).createdAt
        ? new Date((a as any).createdAt).getTime()
        : 0;
      const bt = (b as any).createdAt
        ? new Date((b as any).createdAt).getTime()
        : 0;
      return at - bt;
    }
    return a.toolId.localeCompare(b.toolId);
  });
  const counters = new Map<string, number>();
  const toolLines = orderedConfigs.map((c) => {
    const def = toolRegistry.get(c.toolId);
    const alias = (c.config as any)?.alias as string | undefined;
    const current = counters.get(c.toolId) ?? 0;
    const next = current + 1;
    counters.set(c.toolId, next);
    const name = `${c.toolId}:${next}`;
    const baseDesc = def ? def.name : c.toolId;
    const envMerged = {
      ...envBase,
      ...((c.envOverrides as any) || {}),
    } as Record<string, string | undefined>;
    const summaryItems = def?.summarizeInstance
      ? def.summarizeInstance(envMerged, c.config as Record<string, unknown>)
      : [];
    const extras = [alias ? `alias=${alias}` : undefined, ...summaryItems]
      .filter(Boolean)
      .join(", ");
    return extras
      ? `- ${name} — ${baseDesc} (${extras})`
      : `- ${name} — ${baseDesc}`;
  });
  const toolsCatalog =
    toolLines.length > 0 ? `\n\nAvailable tools:\n${toolLines.join("\n")}` : "";

  const toolCalls: AgentResponse["toolCalls"] = [];

  const result = await generateText({
    model: runtimeAgent.model,
    system: `${runtimeAgent.systemPrompt}${toolsCatalog}`,
    messages,
    tools: runtimeAgent.tools,
    maxOutputTokens: runtimeAgent.config.maxTokens,
    temperature: runtimeAgent.config.temperature,
    onStepFinish: ({ toolCalls: stepToolCalls, toolResults }) => {
      if (stepToolCalls) {
        for (const tc of stepToolCalls) {
          // In AI SDK v5+, check for dynamic tools first for proper type narrowing
          if (tc.dynamic) {
            // Dynamic tool: input is 'unknown'
            onToolCall?.(tc.toolName, tc.input);
            toolCalls.push({
              name: tc.toolName,
              args: tc.input,
              result: null,
            });
          } else {
            // Static tool: use tc.input (renamed from tc.args in v5)
            onToolCall?.(tc.toolName, tc.input);
            toolCalls.push({
              name: tc.toolName,
              args: tc.input,
              result: null,
            });
          }
        }
      }
      if (toolResults) {
        for (const tr of toolResults) {
          // In AI SDK v5+, check for dynamic tools first
          if (tr.dynamic) {
            // Dynamic tool result: output is 'unknown'
            onToolResult?.(tr.toolName, tr.output);
            const call = toolCalls.find(
              (c) => c.name === tr.toolName && c.result === null,
            );
            if (call) call.result = tr.output;
          } else {
            // Static tool result: use tr.output (renamed from tr.result in v5)
            onToolResult?.(tr.toolName, tr.output);
            const call = toolCalls.find(
              (c) => c.name === tr.toolName && c.result === null,
            );
            if (call) call.result = tr.output;
          }
        }
      }
    },
  });

  return {
    content: result.text,
    toolCalls,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

/**
 * Stream an agent response with automatic tool execution.
 */
export async function streamAgent(options: RunAgentOptions) {
  const {
    agentId,
    chatId,
    userId,
    organizationId,
    messages,
    onToolCall,
    onToolResult,
  } = options;

  const context: AgentExecutionContext = {
    chatId,
    userId,
    organizationId,
  };

  const runtimeAgent = await createRuntimeAgent(agentId, context);

  const configs = await db.query.agentToolConfig.findMany({
    where: eq(agentToolConfig.agentId, agentId),
  });
  const enabledConfigs = configs.filter((c) => c.isEnabled);
  const envBase2 = await getMergedEnv({
    organizationId,
    userId,
    chatId,
  });
  const orderedConfigs2 = enabledConfigs.slice().sort((a, b) => {
    if (a.toolId === b.toolId) {
      const at = (a as any).createdAt
        ? new Date((a as any).createdAt).getTime()
        : 0;
      const bt = (b as any).createdAt
        ? new Date((b as any).createdAt).getTime()
        : 0;
      return at - bt;
    }
    return a.toolId.localeCompare(b.toolId);
  });
  const counters2 = new Map<string, number>();
  const toolLines = orderedConfigs2.map((c) => {
    const def = toolRegistry.get(c.toolId);
    const alias = (c.config as any)?.alias as string | undefined;
    const current = counters2.get(c.toolId) ?? 0;
    const next = current + 1;
    counters2.set(c.toolId, next);
    const name = `${c.toolId}:${next}`;
    const baseDesc = def ? def.name : c.toolId;
    const envMerged = {
      ...envBase2,
      ...((c.envOverrides as any) || {}),
    } as Record<string, string | undefined>;
    const summaryItems = def?.summarizeInstance
      ? def.summarizeInstance(envMerged, c.config as Record<string, unknown>)
      : [];
    const extras = [alias ? `alias=${alias}` : undefined, ...summaryItems]
      .filter(Boolean)
      .join(", ");
    return extras
      ? `- ${name} — ${baseDesc} (${extras})`
      : `- ${name} — ${baseDesc}`;
  });
  const toolsCatalog =
    toolLines.length > 0 ? `\n\nAvailable tools:\n${toolLines.join("\n")}` : "";

  return streamText({
    model: runtimeAgent.model,
    system: `${runtimeAgent.systemPrompt}${toolsCatalog}`,
    messages,
    tools: runtimeAgent.tools,
    maxOutputTokens: runtimeAgent.config.maxTokens,
    temperature: runtimeAgent.config.temperature,
    onStepFinish: ({ toolCalls, toolResults }) => {
      if (toolCalls) {
        for (const tc of toolCalls) {
          // In AI SDK v5+, check for dynamic tools first
          if (tc.dynamic) {
            onToolCall?.(tc.toolName, tc.input);
          } else {
            // Use tc.input (renamed from tc.args in v5)
            onToolCall?.(tc.toolName, tc.input);
          }
        }
      }
      if (toolResults) {
        for (const tr of toolResults) {
          // In AI SDK v5+, check for dynamic tools first
          if (tr.dynamic) {
            onToolResult?.(tr.toolName, tr.output);
          } else {
            // Use tr.output (renamed from tr.result in v5)
            onToolResult?.(tr.toolName, tr.output);
          }
        }
      }
    },
  });
}

/**
 * Save an agent response to the database.
 */
export async function saveAgentResponse(params: {
  chatId: string;
  agentId: string;
  response: AgentResponse;
}): Promise<Message> {
  const { chatId, agentId, response } = params;

  const newMessage: NewMessage = {
    chatId,
    authorType: "agent",
    authorId: agentId,
    role: "assistant",
    content: response.content,
    parts:
      response.toolCalls.length > 0
        ? response.toolCalls.map((tc) => ({
            type: "tool-result",
            toolName: tc.name,
            args: tc.args,
            result: tc.result,
          }))
        : [],
    attachments: [],
    tokenCount: response.usage.totalTokens,
    // Cost calculation would go here based on model pricing
  };

  const [saved] = await db.insert(message).values(newMessage).returning();
  return saved;
}
