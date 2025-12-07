import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";
import { artifact as artifactTable } from "@/db/schema/chat";
import type { DbInstance } from "@/db";
import { Artifact } from "@/domain/artifact/artifact";

function toDomain(row: typeof artifactTable.$inferSelect): Artifact {
  return new Artifact({
    id: Identifier.from(row.id),
    chatId: row.chatId ? Identifier.from(row.chatId) : null,
    userId: row.userId,
    title: row.title,
    content: row.content ?? null,
    kind: row.kind as Artifact["snapshot"]["kind"],
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  });
}

function toRow(entity: Artifact): typeof artifactTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    chatId: snap.chatId?.toString() ?? null,
    userId: snap.userId,
    title: snap.title,
    content: snap.content ?? null,
    kind: snap.kind,
    version: snap.version,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt ?? new Date(),
  };
}

export class DrizzleArtifactRepository implements Repository<Artifact> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Artifact | null> {
    const row = await this.db.query.artifact.findFirst({
      where: eq(artifactTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: Artifact): Promise<Artifact> {
    const row = toRow(entity);
    await this.db
      .insert(artifactTable)
      .values(row)
      .onConflictDoUpdate({
        target: artifactTable.id,
        set: {
          title: row.title,
          content: row.content,
          kind: row.kind,
          version: row.version,
          updatedAt: new Date(),
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(artifactTable)
      .where(eq(artifactTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
