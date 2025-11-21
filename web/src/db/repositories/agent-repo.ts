import { db } from "@/db";
import { agent, Agent, agentToolConfig } from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

// ==================== TYPES ====================

export interface AgentFilters {
  organizationId: string;
  search?: string;
  visibility?: "private" | "team" | "public";
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentWithTools extends Agent {
  tools: Array<{
    toolId: string;
    toolType: string;
    isEnabled: boolean;
  }>;
}

// ==================== REPOSITORY ====================

export const agentRepo = {
  // --- Basic CRUD ---

  async findById(id: string): Promise<Agent | undefined> {
    return db.query.agent.findFirst({
      where: and(eq(agent.id, id), eq(agent.isArchived, false)),
    });
  },

  async findByIdWithTools(id: string): Promise<AgentWithTools | undefined> {
    const agentEntity = await db.query.agent.findFirst({
      where: and(eq(agent.id, id), eq(agent.isArchived, false)),
      with: {
        toolConfigs: true,
      },
    });

    if (!agentEntity) return undefined;

    return {
      ...agentEntity,
      tools: agentEntity.toolConfigs.map((tc) => ({
        toolId: tc.toolId,
        toolType: tc.toolType,
        isEnabled: tc.isEnabled,
      })),
    };
  },

  async create(data: typeof agent.$inferInsert): Promise<Agent> {
    const [row] = await db.insert(agent).values(data).returning();
    return row;
  },

  async update(
    id: string,
    data: Partial<typeof agent.$inferInsert>,
  ): Promise<Agent | undefined> {
    const [row] = await db
      .update(agent)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agent.id, id))
      .returning();
    return row;
  },

  async archive(id: string): Promise<Agent | undefined> {
    const [row] = await db
      .update(agent)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(agent.id, id))
      .returning();
    return row;
  },

  async delete(id: string): Promise<Agent | undefined> {
    const [row] = await db.delete(agent).where(eq(agent.id, id)).returning();
    return row;
  },

  // --- Query Methods ---

  async findByOrganization(filters: AgentFilters): Promise<Agent[]> {
    const conditions = [eq(agent.organizationId, filters.organizationId)];

    if (!filters.includeArchived) {
      conditions.push(eq(agent.isArchived, false));
    }

    if (filters.visibility) {
      conditions.push(eq(agent.visibility, filters.visibility));
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(agent.name, `%${filters.search}%`),
          ilike(agent.description, `%${filters.search}%`),
        )!,
      );
    }

    return db.query.agent.findMany({
      where: and(...conditions),
      orderBy: desc(agent.createdAt),
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  },

  async findByCreator(
    userId: string,
    organizationId: string,
  ): Promise<Agent[]> {
    return db.query.agent.findMany({
      where: and(
        eq(agent.createdBy, userId),
        eq(agent.organizationId, organizationId),
        eq(agent.isArchived, false),
      ),
      orderBy: desc(agent.createdAt),
    });
  },

  async countByOrganization(organizationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(agent)
      .where(
        and(
          eq(agent.organizationId, organizationId),
          eq(agent.isArchived, false),
        ),
      );
    return result[0]?.count ?? 0;
  },

  // --- Tool Management ---

  async addToolConfig(
    agentId: string,
    config: {
      toolId: string;
      toolType: "builtin" | "custom" | "mcp";
      config?: Record<string, unknown>;
      envOverrides?: Record<string, string>;
    },
  ) {
    const [row] = await db
      .insert(agentToolConfig)
      .values({
        agentId,
        toolId: config.toolId,
        toolType: config.toolType,
        config: config.config ?? {},
        envOverrides: config.envOverrides ?? {},
        isEnabled: true,
      })
      .onConflictDoUpdate({
        target: [agentToolConfig.agentId, agentToolConfig.toolId],
        set: {
          config: config.config ?? {},
          envOverrides: config.envOverrides ?? {},
          isEnabled: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  async removeToolConfig(agentId: string, toolId: string) {
    const [row] = await db
      .delete(agentToolConfig)
      .where(
        and(
          eq(agentToolConfig.agentId, agentId),
          eq(agentToolConfig.toolId, toolId),
        ),
      )
      .returning();
    return row;
  },

  async updateToolConfig(
    agentId: string,
    toolId: string,
    update: {
      config?: Record<string, unknown>;
      envOverrides?: Record<string, string>;
      isEnabled?: boolean;
    },
  ) {
    const [row] = await db
      .update(agentToolConfig)
      .set({
        config: update.config,
        envOverrides: update.envOverrides,
        isEnabled: update.isEnabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentToolConfig.agentId, agentId),
          eq(agentToolConfig.toolId, toolId),
        ),
      )
      .returning();
    return row;
  },

  async getToolConfigs(agentId: string) {
    return db.query.agentToolConfig.findMany({
      where: eq(agentToolConfig.agentId, agentId),
    });
  },

  // --- Duplication ---

  async duplicate(
    id: string,
    newName: string,
    newCreatorId: string,
  ): Promise<Agent | undefined> {
    const original = await this.findByIdWithTools(id);
    if (!original) return undefined;

    // Create new agent
    const [newAgent] = await db
      .insert(agent)
      .values({
        organizationId: original.organizationId,
        createdBy: newCreatorId,
        name: newName,
        description: original.description,
        instructions: original.instructions,
        avatarUrl: original.avatarUrl,
        model: original.model,
        maxTokens: original.maxTokens,
        temperature: original.temperature,
        visibility: "private", // Always start as private
        defaultToolIds: original.defaultToolIds,
        defaultKnowledgeBaseIds: original.defaultKnowledgeBaseIds,
        metadata: original.metadata,
      })
      .returning();

    // Copy tool configs
    const toolConfigs = await this.getToolConfigs(id);
    if (toolConfigs.length > 0) {
      await db.insert(agentToolConfig).values(
        toolConfigs.map((tc) => ({
          agentId: newAgent.id,
          toolId: tc.toolId,
          toolType: tc.toolType,
          config: tc.config,
          envOverrides: tc.envOverrides,
          isEnabled: tc.isEnabled,
        })),
      );
    }

    return newAgent;
  },
};
