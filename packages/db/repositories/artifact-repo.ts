import { and, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { DbInstance } from "../index";
import { artifact, suggestion, type ArtifactKind } from "../schema";

export interface ArtifactFilters {
  chatId?: string;
  userId?: string;
  kind?: ArtifactKind;
  search?: string;
  limit?: number;
  offset?: number;
}

export function createArtifactRepository(database: DbInstance) {
  const db = database;
  return {
    async findById(id: string) {
      return db.query.artifact.findFirst({ where: eq(artifact.id, id) });
    },

    async getById({ id }: { id: string }) {
      try {
        const documents = await db
          .select()
          .from(artifact)
          .where(eq(artifact.id, id))
          .orderBy(sql`created_at asc`);

        return documents;
      } catch (_error) {
        throw new Error("Failed to get documents by id");
      }
    },

    async getDocumentById({ id }: { id: string }) {
      try {
        const [selectedDocument] = await db
          .select()
          .from(artifact)
          .where(eq(artifact.id, id))
          .orderBy(desc(artifact.createdAt));

        return selectedDocument;
      } catch (_error) {
        throw new Error("Failed to get document by id");
      }
    },

    async findByIdWithSuggestions(id: string) {
      return db.query.artifact.findFirst({
        where: eq(artifact.id, id),
        with: { suggestions: true },
      });
    },

    async create(data: typeof artifact.$inferInsert) {
      const [row] = await db.insert(artifact).values(data).returning();
      return row;
    },

    async save({
      id,
      title,
      kind,
      content,
      userId,
    }: {
      id: string;
      title: string;
      kind: ArtifactKind;
      content: string;
      userId: string;
    }) {
      try {
        return await db
          .insert(artifact)
          .values({
            id,
            title,
            kind,
            content,
            userId,
            createdAt: new Date(),
          })
          .returning();
      } catch (_error) {
        throw new Error("Failed to save document");
      }
    },

    async update(id: string, data: Partial<typeof artifact.$inferInsert>) {
      const current = await this.findById(id);
      const [row] = await db
        .update(artifact)
        .set({
          ...data,
          version: (current?.version ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(artifact.id, id))
        .returning();
      return row;
    },

    async delete(id: string) {
      const [row] = await db
        .delete(artifact)
        .where(eq(artifact.id, id))
        .returning();
      return row;
    },

    async deleteByIdAfterTimestamp({
      id,
      timestamp,
    }: {
      id: string;
      timestamp: Date;
    }) {
      try {
        await db
          .delete(suggestion)
          .where(
            and(
              eq(suggestion.documentId, id),
              gt(suggestion.createdAt, timestamp),
            ),
          );

        return await db
          .delete(artifact)
          .where(and(eq(artifact.id, id), gt(artifact.createdAt, timestamp)))
          .returning();
      } catch (_error) {
        throw new Error("Failed to delete documents by id after timestamp");
      }
    },

    // --- Query Methods ---

    async findMany(filters: ArtifactFilters) {
      const conditions = [];

      if (filters.chatId) {
        conditions.push(eq(artifact.chatId, filters.chatId));
      }
      if (filters.userId) {
        conditions.push(eq(artifact.userId, filters.userId));
      }
      if (filters.kind) {
        conditions.push(eq(artifact.kind, filters.kind));
      }
      if (filters.search) {
        conditions.push(
          or(
            ilike(artifact.title, `%${filters.search}%`),
            ilike(artifact.content, `%${filters.search}%`),
          )!,
        );
      }

      return db.query.artifact.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: desc(artifact.updatedAt),
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      });
    },

    async findForChat(
      chatId: string,
      opts?: { kind?: ArtifactKind; limit?: number },
    ) {
      const conditions = [eq(artifact.chatId, chatId)];
      if (opts?.kind) {
        conditions.push(eq(artifact.kind, opts.kind));
      }

      return db.query.artifact.findMany({
        where: and(...conditions),
        orderBy: desc(artifact.updatedAt),
        limit: opts?.limit ?? 50,
      });
    },

    async findForUser(
      userId: string,
      opts?: { kind?: ArtifactKind; limit?: number },
    ) {
      const conditions = [eq(artifact.userId, userId)];
      if (opts?.kind) {
        conditions.push(eq(artifact.kind, opts.kind));
      }

      return db.query.artifact.findMany({
        where: and(...conditions),
        orderBy: desc(artifact.updatedAt),
        limit: opts?.limit ?? 50,
      });
    },

    async countByChat(chatId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(artifact)
        .where(eq(artifact.chatId, chatId));
      return result[0]?.count ?? 0;
    },

    async countByUser(userId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(artifact)
        .where(eq(artifact.userId, userId));
      return result[0]?.count ?? 0;
    },

    // --- Version Management ---

    async getLatestVersion(id: string): Promise<number> {
      const doc = await this.findById(id);
      return doc?.version ?? 0;
    },

    async updateContent(id: string, content: string) {
      return this.update(id, { content });
    },
  };
}
