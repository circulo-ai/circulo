import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";
import { agent as agentTable } from "@/db/schema/agent";
import type { DbInstance } from "@/db";
import { Agent } from "@/domain/agent/agent";

function toDomain(row: typeof agentTable.$inferSelect): Agent {
  return new Agent({
    id: Identifier.from(row.id),
    organizationId: row.organizationId,
    createdBy: row.createdBy,
    name: row.name,
    instructions: row.instructions,
    description: row.description ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    model: row.model,
    maxTokens: row.maxTokens ?? null,
    temperature: row.temperature ?? null,
    isArchived: row.isArchived ?? false,
    defaultToolIds: row.defaultToolIds ?? [],
    defaultKnowledgeBaseIds: row.defaultKnowledgeBaseIds ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  });
}

function toRow(entity: Agent): typeof agentTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    organizationId: snap.organizationId,
    createdBy: snap.createdBy,
    name: snap.name,
    instructions: snap.instructions,
    description: snap.description ?? null,
    avatarUrl: snap.avatarUrl ?? null,
    model: snap.model,
    maxTokens: snap.maxTokens ?? null,
    temperature: snap.temperature ?? null,
    isArchived: snap.isArchived ?? false,
    defaultToolIds: snap.defaultToolIds ?? [],
    defaultKnowledgeBaseIds: snap.defaultKnowledgeBaseIds ?? [],
    metadata: snap.metadata ?? {},
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt ?? new Date(),
  };
}

export class DrizzleAgentRepository implements Repository<Agent> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Agent | null> {
    const row = await this.db.query.agent.findFirst({
      where: eq(agentTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: Agent): Promise<Agent> {
    const row = toRow(entity);
    await this.db
      .insert(agentTable)
      .values(row)
      .onConflictDoUpdate({
        target: agentTable.id,
        set: {
          name: row.name,
          instructions: row.instructions,
          description: row.description,
          avatarUrl: row.avatarUrl,
          model: row.model,
          maxTokens: row.maxTokens,
          temperature: row.temperature,
          isArchived: row.isArchived,
          defaultToolIds: row.defaultToolIds,
          defaultKnowledgeBaseIds: row.defaultKnowledgeBaseIds,
          metadata: row.metadata,
          updatedAt: new Date(),
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .update(agentTable)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(agentTable.id, id.toString()));
    return "rowCount" in result ? (result as { rowCount: number }).rowCount > 0 : true;
  }
}
