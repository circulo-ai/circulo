import { db, memory, embeddingChunk, embeddingPreference } from "@/db";
import {
  createKnowledgeEmbeddingWithMetadata,
  type EmbeddingResult,
} from "@/lib/knowledge/embeddings";
import { getEmbeddingPreferences } from "@/lib/knowledge/embedding-settings";
import { memorySemanticDistance } from "@/lib/knowledge/semantic-distance";
import { embeddingPreferencesSchema } from "@circulo-ai/types";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

const MAX_MEMORY_RESULTS = 20;

export async function retrieveMemories(params: {
  organizationId: string;
  userId: string;
  scopes: Array<SQL | undefined>;
  query: string;
  limit: number;
  queryEmbedding?: { embedding: number[]; model: string } | null;
}) {
  const scopes = params.scopes.filter((scope): scope is SQL => Boolean(scope));
  if (!scopes.length) return [];
  const query = params.query.trim();
  if (!query) return [];

  const queryEmbedding =
    params.queryEmbedding === undefined
      ? await createKnowledgeEmbeddingWithMetadata(query, "", {
          userId: params.userId,
          organizationId: params.organizationId,
        }).catch(() => null)
      : params.queryEmbedding;
  const lexicalRank = sql<number>`ts_rank(
    to_tsvector('simple', ${memory.key} || ' ' || ${memory.content}),
    plainto_tsquery('simple', ${query})
  )`;
  const lexicalMatch = sql`to_tsvector(
    'simple', ${memory.key} || ' ' || ${memory.content}
  ) @@ plainto_tsquery('simple', ${query})`;
  const baseConditions = and(
    sql`${memory.organizationId} = ${params.organizationId}`,
    or(...scopes),
  );
  const candidateLimit = Math.max(
    40,
    Math.min(params.limit * 8, MAX_MEMORY_RESULTS * 8),
  );
  const [lexicalCandidates, semanticCandidates] = await Promise.all([
    db.query.memory.findMany({
      where: and(baseConditions, lexicalMatch),
      orderBy: desc(lexicalRank),
      limit: candidateLimit,
    }),
    queryEmbedding
      ? db.query.memory.findMany({
          where: and(
            baseConditions,
            eq(memory.embeddingModel, queryEmbedding.model),
            sql`${memorySemanticDistance(queryEmbedding)} IS NOT NULL`,
          ),
          orderBy: asc(memorySemanticDistance(queryEmbedding)),
          limit: candidateLimit,
        })
      : Promise.resolve([]),
  ]);

  const ranked = new Map<
    string,
    { item: (typeof lexicalCandidates)[number]; score: number }
  >();
  const addRanked = (items: typeof lexicalCandidates, weight: number) => {
    items.forEach((item, index) => {
      const existing = ranked.get(item.id);
      ranked.set(item.id, {
        item,
        score: (existing?.score ?? 0) + weight / (60 + index + 1),
      });
    });
  };
  addRanked(lexicalCandidates, 1);
  addRanked(semanticCandidates, 1);
  const results = [...ranked.values()]
    .sort((a, b) => {
      if (a.item.isPinned !== b.item.isPinned) return a.item.isPinned ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      if (a.item.importance !== b.item.importance)
        return b.item.importance - a.item.importance;
      return b.item.updatedAt.getTime() - a.item.updatedAt.getTime();
    })
    .slice(0, Math.max(1, Math.min(params.limit, MAX_MEMORY_RESULTS)))
    .map(({ item }) => item);

  if (results.length) {
    await db
      .update(memory)
      .set({ lastUsedAt: new Date() })
      .where(
        inArray(
          memory.id,
          results.map((item) => item.id),
        ),
      );
  }

  return results;
}

export async function createMemoryEmbedding(params: {
  key: string;
  content: string;
  userId: string;
  organizationId: string;
  signal?: AbortSignal;
}) {
  try {
    return await createKnowledgeEmbeddingWithMetadata(
      params.key,
      params.content,
      {
        userId: params.userId,
        organizationId: params.organizationId,
        signal: params.signal,
      },
    );
  } catch {
    // Memory writes should still work when an embedding provider is unavailable.
    return null;
  }
}

export type MemoryTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
type MemoryEmbeddingFields = Partial<
  Pick<
    typeof memory.$inferSelect,
    "embedding" | "embeddingModel" | "embeddingUpdatedAt"
  >
>;

/** Commit memory content and its passage vectors together under the workspace settings lock. */
export async function writeMemoryWithEmbedding(
  organizationId: string,
  result: EmbeddingResult | null | undefined,
  write: (
    tx: MemoryTransaction,
    fields: MemoryEmbeddingFields,
  ) => Promise<typeof memory.$inferSelect | undefined>,
) {
  await getEmbeddingPreferences(organizationId);
  return db.transaction(async (tx) => {
    const [settings] = await tx
      .select()
      .from(embeddingPreference)
      .where(eq(embeddingPreference.organizationId, organizationId))
      .for("update");
    const valid =
      result &&
      settings &&
      JSON.stringify(embeddingPreferencesSchema.parse(settings.config)) ===
        JSON.stringify(result.preferences);
    const fields: MemoryEmbeddingFields =
      result === undefined
        ? {}
        : valid && result
          ? {
              embedding: result.embedding,
              embeddingModel: result.model,
              embeddingUpdatedAt: new Date(),
            }
          : { embedding: null, embeddingModel: null, embeddingUpdatedAt: null };
    const row = await write(tx, fields);
    if (
      !row ||
      row.organizationId !== organizationId ||
      (result && `${row.key}\n\n${row.content}` !== result.sourceText)
    )
      throw new Error("Memory source changed during indexing; retry");
    if (result !== undefined) {
      await tx
        .delete(embeddingChunk)
        .where(eq(embeddingChunk.memoryId, row.id));
      if (valid && result)
        await tx
          .insert(embeddingChunk)
          .values(
            result.chunks.map((chunk) => ({
              ...chunk,
              memoryId: row.id,
              organizationId,
              model: result.model,
            })),
          );
    }
    return { row, indexed: Boolean(valid && result) };
  });
}
