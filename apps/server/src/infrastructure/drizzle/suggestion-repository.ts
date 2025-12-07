import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";
import { suggestion as suggestionTable } from "@/db/schema/chat";
import type { DbInstance } from "@/db";
import { Suggestion } from "@/domain/suggestion/suggestion";

function toDomain(row: typeof suggestionTable.$inferSelect): Suggestion {
  return new Suggestion({
    id: Identifier.from(row.id),
    documentId: Identifier.from(row.documentId),
    userId: row.userId,
    originalText: row.originalText,
    suggestedText: row.suggestedText,
    description: row.description ?? null,
    isResolved: row.isResolved,
    createdAt: row.createdAt,
  });
}

function toRow(entity: Suggestion): typeof suggestionTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    documentId: snap.documentId.toString(),
    userId: snap.userId,
    originalText: snap.originalText,
    suggestedText: snap.suggestedText,
    description: snap.description ?? null,
    isResolved: snap.isResolved,
    createdAt: snap.createdAt,
  };
}

export class DrizzleSuggestionRepository implements Repository<Suggestion> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Suggestion | null> {
    const row = await this.db.query.suggestion.findFirst({
      where: eq(suggestionTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: Suggestion): Promise<Suggestion> {
    const row = toRow(entity);
    await this.db
      .insert(suggestionTable)
      .values(row)
      .onConflictDoUpdate({
        target: suggestionTable.id,
        set: {
          suggestedText: row.suggestedText,
          description: row.description,
          isResolved: row.isResolved,
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(suggestionTable)
      .where(eq(suggestionTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
