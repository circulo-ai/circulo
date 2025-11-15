import { db } from "@/db";
import { agent as agentTable, agentTemplate } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUUID } from "@/lib/utils";
import { createLogger } from "@/lib/logs/console/logger";
import { toolRegistry } from "@/lib/ai/tools/registry";
import type { UnifiedTool } from "@/lib/ai/tools/registry";

const logger = createLogger("AgentFactory");

export interface AgentConfig {
  name: string;
  description?: string | null;  // Allow null
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolIds?: string[];
  avatar?: string | null;  // Allow null
  color?: string | null;   // Allow null
}

export interface AgentInstance {
  id: string;
  config: AgentConfig;
  tools: UnifiedTool[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Agent Factory - Creates and manages agent instances
 */
class AgentFactory {
  /**
   * Create an agent from a template
   */
  async createFromTemplate(
    userId: string,
    templateId: string,
    overrides?: Partial<AgentConfig>
  ): Promise<AgentInstance> {
    logger.info(`Creating agent from template ${templateId} for user ${userId}`);

    // Get template
    const template = await db.query.agentTemplate.findFirst({
      where: (templates, { eq }) => eq(templates.id, templateId),
    });

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Merge template config with overrides - handle nulls properly
    const config: AgentConfig = {
      name: overrides?.name ?? template.name,
      description: overrides?.description ?? template.description ?? null,
      systemPrompt: overrides?.systemPrompt ?? template.systemPrompt,
      model: overrides?.model ?? template.model,
      temperature: overrides?.temperature ?? parseFloat(template.temperature),
      maxTokens: overrides?.maxTokens ?? template.maxTokens ?? 2000,
      toolIds: overrides?.toolIds ?? template.toolIds ?? [],
      avatar: overrides?.avatar ?? template.avatar ?? null,
      color: overrides?.color ?? template.color,
    };

    return await this.create(userId, config, templateId);
  }

  /**
   * Create a custom agent
   */
  async create(
    userId: string,
    config: AgentConfig,
    templateId?: string
  ): Promise<AgentInstance> {
    logger.info(`Creating agent ${config.name} for user ${userId}`);

    const id = generateUUID();

    // Validate tools exist
    if (config.toolIds && config.toolIds.length > 0) {
      await this.validateTools(config.toolIds, userId);
    }

    // Insert into database - handle null values properly
    const [newAgent] = await db
      .insert(agentTable)
      .values({
        id,
        userId,
        templateId: templateId ?? null,
        name: config.name,
        description: config.description ?? null,
        systemPrompt: config.systemPrompt,
        model: config.model ?? "gpt-4",
        temperature: (config.temperature ?? 0.7).toString(),
        maxTokens: config.maxTokens ?? 2000,
        toolIds: config.toolIds ?? [],
        avatar: config.avatar ?? null,
        color: config.color ?? "#3B82F6",
      })
      .returning();

    // Get tools
    const tools = await this.getAgentTools(id, userId);

    return {
      id: newAgent.id,
      config: {
        name: newAgent.name,
        description: newAgent.description,
        systemPrompt: newAgent.systemPrompt,
        model: newAgent.model,
        temperature: parseFloat(newAgent.temperature),
        maxTokens: newAgent.maxTokens ?? 2000,
        toolIds: newAgent.toolIds ?? [],
        avatar: newAgent.avatar,
        color: newAgent.color,
      },
      tools,
      createdAt: newAgent.createdAt,
      updatedAt: newAgent.updatedAt,
    };
  }

  /**
   * Update agent configuration
   */
  async update(
    agentId: string,
    userId: string,
    updates: Partial<AgentConfig>
  ): Promise<AgentInstance> {
    logger.info(`Updating agent ${agentId}`);

    // Verify ownership
    const existing = await db.query.agent.findFirst({
      where: (agents, { eq, and }) =>
        and(eq(agents.id, agentId), eq(agents.userId, userId)),
    });

    if (!existing) {
      throw new Error("Agent not found or access denied");
    }

    // Validate new tools if provided
    if (updates.toolIds) {
      await this.validateTools(updates.toolIds, userId);
    }

    // Build update object with only defined fields
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.systemPrompt !== undefined) updateData.systemPrompt = updates.systemPrompt;
    if (updates.model !== undefined) updateData.model = updates.model;
    if (updates.temperature !== undefined) updateData.temperature = updates.temperature.toString();
    if (updates.maxTokens !== undefined) updateData.maxTokens = updates.maxTokens;
    if (updates.toolIds !== undefined) updateData.toolIds = updates.toolIds;
    if (updates.avatar !== undefined) updateData.avatar = updates.avatar;
    if (updates.color !== undefined) updateData.color = updates.color;

    // Update
    const [updated] = await db
      .update(agentTable)
      .set(updateData)
      .where(and(eq(agentTable.id, agentId), eq(agentTable.userId, userId)))
      .returning();

    const tools = await this.getAgentTools(agentId, userId);

    return {
      id: updated.id,
      config: {
        name: updated.name,
        description: updated.description,
        systemPrompt: updated.systemPrompt,
        model: updated.model,
        temperature: parseFloat(updated.temperature),
        maxTokens: updated.maxTokens ?? 2000,
        toolIds: updated.toolIds ?? [],
        avatar: updated.avatar,
        color: updated.color,
      },
      tools,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Clone an existing agent
   */
  async clone(
    agentId: string,
    userId: string,
    newName: string
  ): Promise<AgentInstance> {
    logger.info(`Cloning agent ${agentId}`);

    const existing = await db.query.agent.findFirst({
      where: (agents, { eq }) => eq(agents.id, agentId),
    });

    if (!existing) {
      throw new Error("Agent not found");
    }

    return await this.create(userId, {
      name: newName,
      description: existing.description,
      systemPrompt: existing.systemPrompt,
      model: existing.model,
      temperature: parseFloat(existing.temperature),
      maxTokens: existing.maxTokens ?? 2000,
      toolIds: existing.toolIds ?? [],
      avatar: existing.avatar,
      color: existing.color,
    });
  }

  /**
   * Auto-configure agent tools based on capabilities needed
   */
  async autoConfigureTools(
    agentId: string,
    userId: string,
    chatId: string,
    requirements: {
      categories?: string[];
      tags?: string[];
      maxTools?: number;
    }
  ): Promise<string[]> {
    logger.info(`Auto-configuring tools for agent ${agentId}`);

    // Search for matching tools
    const matchedTools = await toolRegistry.searchTools(userId, chatId, {
      category: requirements.categories?.[0],
      tags: requirements.tags,
    });

    // Limit number of tools
    const maxTools = requirements.maxTools ?? 10;
    const selectedTools = matchedTools.slice(0, maxTools);

    // Update agent with new tools
    await db
      .update(agentTable)
      .set({
        toolIds: selectedTools.map((t) => t.id),
        updatedAt: new Date(),
      })
      .where(and(eq(agentTable.id, agentId), eq(agentTable.userId, userId)));

    return selectedTools.map((t) => t.id);
  }

  /**
   * Get agent with all its tools
   */
  async get(agentId: string, userId: string): Promise<AgentInstance | null> {
    const agent = await db.query.agent.findFirst({
      where: (agents, { eq, and }) =>
        and(eq(agents.id, agentId), eq(agents.userId, userId)),
    });

    if (!agent) {
      return null;
    }

    const tools = await this.getAgentTools(agentId, userId);

    return {
      id: agent.id,
      config: {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        temperature: parseFloat(agent.temperature),
        maxTokens: agent.maxTokens ?? 2000,
        toolIds: agent.toolIds ?? [],
        avatar: agent.avatar,
        color: agent.color,
      },
      tools,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  private async validateTools(toolIds: string[], userId: string): Promise<void> {
    // For now, just check they're not empty
    // In production, validate each tool exists and user has access
    if (toolIds.length === 0) {
      throw new Error("At least one tool must be provided");
    }
  }

  private async getAgentTools(
    agentId: string,
    userId: string
  ): Promise<UnifiedTool[]> {
    const agent = await db.query.agent.findFirst({
      where: (agents, { eq }) => eq(agents.id, agentId),
    });

    if (!agent || !agent.toolIds || agent.toolIds.length === 0) {
      return [];
    }

    const tools: UnifiedTool[] = [];
    for (const toolId of agent.toolIds) {
      const tool = await toolRegistry.getTool(toolId, userId, agent.id);
      if (tool) {
        tools.push(tool);
      }
    }

    return tools;
  }
}

export const agentFactory = new AgentFactory();