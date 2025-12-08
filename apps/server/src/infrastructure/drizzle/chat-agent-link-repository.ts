import type { DbInstance } from "@/db";
import { chatAgent as chatAgentTable } from "@/db/schema/chat";
import { ChatAgentLink } from "@/domain/chat/chat-agent-link";
import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";

function toDomain(row: typeof chatAgentTable.$inferSelect): ChatAgentLink {
  return new ChatAgentLink({
    id: Identifier.from(row.id),
    chatId: Identifier.from(row.chatId),
    agentId: Identifier.from(row.agentId),
    addedBy: row.addedBy,
    isEnabled: row.isEnabled,
    customInstructions: row.customInstructions ?? null,
    customTemperature: row.customTemperature ?? null,
    createdAt: row.createdAt,
  });
}

function toRow(entity: ChatAgentLink): typeof chatAgentTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    chatId: snap.chatId.toString(),
    agentId: snap.agentId.toString(),
    addedBy: snap.addedBy,
    isEnabled: snap.isEnabled,
    customInstructions: snap.customInstructions ?? null,
    customTemperature: snap.customTemperature ?? null,
    createdAt: snap.createdAt,
  };
}

export class DrizzleChatAgentLinkRepository implements Repository<ChatAgentLink> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<ChatAgentLink | null> {
    const row = await this.db.query.chatAgent.findFirst({
      where: eq(chatAgentTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: ChatAgentLink): Promise<ChatAgentLink> {
    const row = toRow(entity);
    await this.db
      .insert(chatAgentTable)
      .values(row)
      .onConflictDoUpdate({
        target: chatAgentTable.id,
        set: {
          isEnabled: row.isEnabled,
          customInstructions: row.customInstructions,
          customTemperature: row.customTemperature,
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(chatAgentTable)
      .where(eq(chatAgentTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
