import { db } from "@/db";
import { document } from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

export type DocumentKind = "text" | "code" | "image" | "sheet";

export interface DocumentFilters {
  chatId?: string;
  userId?: string;
  kind?: DocumentKind;
  search?: string;
  limit?: number;
  offset?: number;
}

export const documentRepo = {
  async findById(id: string) {
    return db.query.document.findFirst({ where: eq(document.id, id) });
  },

  async findByIdWithSuggestions(id: string) {
    return db.query.document.findFirst({
      where: eq(document.id, id),
      with: { suggestions: true },
    });
  },

  async create(data: typeof document.$inferInsert) {
    const [row] = await db.insert(document).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof document.$inferInsert>) {
    const current = await this.findById(id);
    const [row] = await db
      .update(document)
      .set({
        ...data,
        version: (current?.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(document.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db
      .delete(document)
      .where(eq(document.id, id))
      .returning();
    return row;
  },

  // --- Query Methods ---

  async findMany(filters: DocumentFilters) {
    const conditions = [];

    if (filters.chatId) {
      conditions.push(eq(document.chatId, filters.chatId));
    }
    if (filters.userId) {
      conditions.push(eq(document.userId, filters.userId));
    }
    if (filters.kind) {
      conditions.push(eq(document.kind, filters.kind));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(document.title, `%${filters.search}%`),
          ilike(document.content, `%${filters.search}%`),
        )!,
      );
    }

    return db.query.document.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(document.updatedAt),
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  },

  async findForChat(
    chatId: string,
    opts?: { kind?: DocumentKind; limit?: number },
  ) {
    const conditions = [eq(document.chatId, chatId)];
    if (opts?.kind) {
      conditions.push(eq(document.kind, opts.kind));
    }

    return db.query.document.findMany({
      where: and(...conditions),
      orderBy: desc(document.updatedAt),
      limit: opts?.limit ?? 50,
    });
  },

  async findForUser(
    userId: string,
    opts?: { kind?: DocumentKind; limit?: number },
  ) {
    const conditions = [eq(document.userId, userId)];
    if (opts?.kind) {
      conditions.push(eq(document.kind, opts.kind));
    }

    return db.query.document.findMany({
      where: and(...conditions),
      orderBy: desc(document.updatedAt),
      limit: opts?.limit ?? 50,
    });
  },

  async countByChat(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(document)
      .where(eq(document.chatId, chatId));
    return result[0]?.count ?? 0;
  },

  async countByUser(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(document)
      .where(eq(document.userId, userId));
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
