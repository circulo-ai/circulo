import { loadToolsForAgent, ToolLoadContext } from "@/ai/tools/loader";
import { db } from "@/db";
import { Agent, agent, chatAgent } from "@/db/schema";
import { myProvider } from "@/lib/ai/providers";
import { Tool as CoreTool } from "ai";
import { and, eq } from "drizzle-orm";

// ==================== TYPES ====================

export interface AgentExecutionContext extends ToolLoadContext {
  chatId?: string;
}

export interface RuntimeAgent {
  id: string;
  name: string;
  model: ReturnType<typeof myProvider.languageModel>;
  systemPrompt: string;
  tools: Record<string, CoreTool>;
  config: {
    maxTokens?: number;
    temperature?: number;
  };
  metadata: {
    toolsLoaded: string[];
    toolsFailed: Array<{ toolId: string; reason: string }>;
  };
}

// ==================== AGENT RESOLUTION ====================

/**
 * Resolve an agent entity, applying chat-level overrides if in a chat context.
 */
async function resolveAgentEntity(
  agentId: string,
  chatId?: string,
): Promise<Agent | undefined> {
  if (chatId) {
    // Look for chat-specific agent config
    const chatAgentRow = await db.query.chatAgent.findFirst({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId),
        eq(chatAgent.isEnabled, true),
      ),
      with: { agent: true },
    });

    if (chatAgentRow?.agent) {
      // Apply chat-level overrides
      return {
        ...chatAgentRow.agent,
        instructions:
          chatAgentRow.customInstructions ?? chatAgentRow.agent.instructions,
        temperature: chatAgentRow.customTemperature
          ? parseInt(chatAgentRow.customTemperature, 10)
          : chatAgentRow.agent.temperature,
      };
    }
  }

  // Fall back to base agent
  return db.query.agent.findFirst({
    where: and(eq(agent.id, agentId), eq(agent.isArchived, false)),
  });
}

// ==================== AGENT FACTORY ====================

/**
 * Create a runtime agent from a database entity with all tools loaded.
 */
export async function createRuntimeAgent(
  agentId: string,
  context: AgentExecutionContext,
): Promise<RuntimeAgent> {
  const entity = await resolveAgentEntity(agentId, context.chatId);

  if (!entity) {
    throw new AgentNotFoundError(agentId);
  }

  // Build tool loading context
  const toolContext: ToolLoadContext = {
    organizationId: entity.organizationId,
    userId: context.userId,
    chatId: context.chatId,
  };

  // Load all configured tools
  const { tools, loaded, failed } = await loadToolsForAgent(
    entity.id,
    toolContext,
  );

  // Log any tool loading failures
  if (failed.length > 0) {
    console.warn(`Agent ${agentId} failed to load tools:`, failed);
  }

  // Build the runtime agent
  return {
    id: entity.id,
    name: entity.name,
    model: myProvider.languageModel(entity.model),
    systemPrompt: entity.instructions,
    tools,
    config: {
      maxTokens: entity.maxTokens ?? undefined,
      temperature: entity.temperature ? entity.temperature / 100 : undefined,
    },
    metadata: {
      toolsLoaded: loaded,
      toolsFailed: failed,
    },
  };
}

/**
 * Create multiple runtime agents (for multi-agent scenarios).
 */
export async function createRuntimeAgents(
  agentIds: string[],
  context: AgentExecutionContext,
): Promise<Map<string, RuntimeAgent>> {
  const agents = new Map<string, RuntimeAgent>();

  await Promise.all(
    agentIds.map(async (id) => {
      try {
        const runtimeAgent = await createRuntimeAgent(id, context);
        agents.set(id, runtimeAgent);
      } catch (err) {
        console.error(`Failed to create agent ${id}:`, err);
      }
    }),
  );

  return agents;
}

// ==================== ERRORS ====================

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = "AgentNotFoundError";
  }
}

export class AgentToolError extends Error {
  constructor(agentId: string, toolId: string, reason: string) {
    super(`Agent ${agentId} tool error (${toolId}): ${reason}`);
    this.name = "AgentToolError";
  }
}
