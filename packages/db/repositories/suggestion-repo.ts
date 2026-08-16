import { and, desc, eq, sql } from "drizzle-orm";
import type { DbInstance } from "../index";
import { suggestion, type Suggestion } from "../schema";

export function createSuggestionRepository(database: DbInstance) {
  const db = database;
  return {
    async findById(id: string) {
      return db.query.suggestion.findFirst({ where: eq(suggestion.id, id) });
    },

    async create(data: typeof suggestion.$inferInsert) {
      const [row] = await db.insert(suggestion).values(data).returning();
      return row;
    },

    async save({ suggestions }: { suggestions: Suggestion[] }) {
      try {
        return await db.insert(suggestion).values(suggestions);
      } catch (_error) {
        throw new Error("Failed to save suggestions");
      }
    },

    async update(id: string, data: Partial<typeof suggestion.$inferInsert>) {
      const [row] = await db
        .update(suggestion)
        .set(data)
        .where(eq(suggestion.id, id))
        .returning();
      return row;
    },

    async delete(id: string) {
      const [row] = await db
        .delete(suggestion)
        .where(eq(suggestion.id, id))
        .returning();
      return row;
    },

    // --- Query Methods ---

    async getByDocumentId({ documentId }: { documentId: string }) {
      try {
        return await db
          .select()
          .from(suggestion)
          .where(eq(suggestion.documentId, documentId));
      } catch (_error) {
        throw new Error("Failed to get suggestions by document id");
      }
    },

    async findForDocument(
      documentId: string,
      opts?: { includeResolved?: boolean },
    ) {
      const conditions = [eq(suggestion.documentId, documentId)];
      if (!opts?.includeResolved) {
        conditions.push(eq(suggestion.isResolved, false));
      }

      return db.query.suggestion.findMany({
        where: and(...conditions),
        with: { user: true },
        orderBy: desc(suggestion.createdAt),
      });
    },

    async findByUser(userId: string, opts?: { limit?: number }) {
      return db.query.suggestion.findMany({
        where: eq(suggestion.userId, userId),
        with: { document: true },
        orderBy: desc(suggestion.createdAt),
        limit: opts?.limit ?? 50,
      });
    },

    async findUnresolvedForDocument(documentId: string) {
      return db.query.suggestion.findMany({
        where: and(
          eq(suggestion.documentId, documentId),
          eq(suggestion.isResolved, false),
        ),
        orderBy: desc(suggestion.createdAt),
      });
    },

    // --- Suggestion Actions ---

    async resolve(id: string) {
      const [row] = await db
        .update(suggestion)
        .set({ isResolved: true })
        .where(eq(suggestion.id, id))
        .returning();
      return row;
    },

    async unresolve(id: string) {
      const [row] = await db
        .update(suggestion)
        .set({ isResolved: false })
        .where(eq(suggestion.id, id))
        .returning();
      return row;
    },

    async resolveAllForDocument(documentId: string) {
      const result = await db
        .update(suggestion)
        .set({ isResolved: true })
        .where(
          and(
            eq(suggestion.documentId, documentId),
            eq(suggestion.isResolved, false),
          ),
        )
        .returning();
      return result.length;
    },

    async countUnresolved(documentId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(suggestion)
        .where(
          and(
            eq(suggestion.documentId, documentId),
            eq(suggestion.isResolved, false),
          ),
        );
      return result[0]?.count ?? 0;
    },

    async countByDocument(documentId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(suggestion)
        .where(eq(suggestion.documentId, documentId));
      return result[0]?.count ?? 0;
    },
  };
}
