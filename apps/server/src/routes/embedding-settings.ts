import {
  db,
  embeddingChunk,
  embeddingPreference,
  knowledgeDocument,
  memory,
} from "@/db";
import { createRouter, type AppEnv } from "@/lib/create-app";
import {
  getEmbeddingPreferences,
  resolveEmbeddingConfig,
} from "@/lib/knowledge/embedding-settings";
import { requestEmbeddingVectors } from "@/lib/knowledge/embedding-provider";
import { refreshKnowledgeDocumentEmbedding } from "@/lib/knowledge/embeddings";
import { getKnowledgeAssetKey } from "@/lib/knowledge/assets";
import {
  getKnowledgeImageFileName,
  refreshKnowledgeImageDocument,
} from "@/lib/knowledge/vision";
import { storageManager } from "@/lib/storage/config";
import {
  createMemoryEmbedding,
  writeMemoryWithEmbedding,
} from "@/lib/memory/retrieval";
import { hasPermissionForUser, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { rateLimit } from "@/middleware/rate-limit";
import {
  BadRequestError,
  ForbiddenError,
  embeddingPreferencesSchema,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, eq, gt, isNull, ne, or } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";

const router = createRouter();
async function context(c: Context<AppEnv>) {
  const organizationId = c.get("activeOrgId");
  if (!organizationId || !(await isMemberOf(c.var.user!.id, organizationId)))
    throw new ForbiddenError("An active workspace membership is required");
  const userId = c.var.user!.id;
  const [knowledgeManager, memoryManager, memoryReader] = await Promise.all([
    hasPermissionForUser(
      userId,
      organizationId,
      "knowledge",
      "manage",
      c.var.apiKeyPermissions,
    ),
    hasPermissionForUser(
      userId,
      organizationId,
      "memory",
      "manage",
      c.var.apiKeyPermissions,
    ),
    hasPermissionForUser(
      userId,
      organizationId,
      "memory",
      "read",
      c.var.apiKeyPermissions,
    ),
  ]);
  return {
    organizationId,
    userId,
    knowledgeManager,
    memoryManager,
    memoryReader,
    canManage: knowledgeManager && memoryManager,
  };
}

router.get("/embedding-settings", requireAuth, async (c) => {
  const ctx = await context(c);
  const config = await getEmbeddingPreferences(ctx.organizationId);
  const resolved = await resolveEmbeddingConfig(ctx.userId, config);
  const [documents, memories] = await Promise.all([
    db
      .select({ total: count() })
      .from(knowledgeDocument)
      .where(eq(knowledgeDocument.organizationId, ctx.organizationId)),
    db
      .select({ total: count() })
      .from(memory)
      .where(
        and(
          eq(memory.organizationId, ctx.organizationId),
          eq(memory.scope, "user"),
          eq(memory.userId, ctx.userId),
        ),
      ),
  ]);
  const documentPending = await db.$count(
    knowledgeDocument,
    and(
      eq(knowledgeDocument.organizationId, ctx.organizationId),
      or(
        isNull(knowledgeDocument.embedding),
        resolved
          ? ne(knowledgeDocument.embeddingModel, resolved.identity)
          : undefined,
      ),
    ),
  );
  const memoryPending = await db.$count(
    memory,
    and(
      eq(memory.organizationId, ctx.organizationId),
      eq(memory.scope, "user"),
      eq(memory.userId, ctx.userId),
      or(
        isNull(memory.embedding),
        resolved ? ne(memory.embeddingModel, resolved.identity) : undefined,
      ),
    ),
  );
  return c.json({
    config,
    canManage: ctx.canManage,
    canReindexKnowledge: ctx.knowledgeManager,
    configured: Boolean(resolved),
    dimensions: 1536,
    documents: { total: documents[0]?.total ?? 0, pending: documentPending },
    memories: { total: memories[0]?.total ?? 0, pending: memoryPending },
  });
});

router.post(
  "/embedding-settings/test",
  requireAuth,
  rateLimit({
    limit: 10,
    windowMs: 60000,
    keyResolver: (c) => `embedding-test:${c.var.user!.id}`,
  }),
  zValidator("json", embeddingPreferencesSchema),
  async (c) => {
    const ctx = await context(c);
    const config = await resolveEmbeddingConfig(
      ctx.userId,
      c.req.valid("json"),
    );
    if (!config)
      throw new BadRequestError(
        "Enable semantic indexing and configure an OpenAI or OpenRouter credential in AI providers",
      );
    await requestEmbeddingVectors(
      config,
      ["Circulo embedding connection check"],
      c.req.raw.signal,
    );
    return c.json({ connected: true, dimensions: 1536 });
  },
);

router.patch(
  "/embedding-settings",
  requireAuth,
  zValidator("json", embeddingPreferencesSchema),
  async (c) => {
    const ctx = await context(c);
    if (!ctx.canManage)
      throw new ForbiddenError(
        "Knowledge and memory management permissions are required to change workspace indexing settings",
      );
    await getEmbeddingPreferences(ctx.organizationId);
    const config = c.req.valid("json");
    const changed = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(embeddingPreference)
        .where(eq(embeddingPreference.organizationId, ctx.organizationId))
        .for("update");
      if (
        JSON.stringify(embeddingPreferencesSchema.parse(existing?.config)) ===
        JSON.stringify(config)
      )
        return false;
      await tx
        .update(embeddingPreference)
        .set({ config, updatedAt: new Date() })
        .where(eq(embeddingPreference.organizationId, ctx.organizationId));
      await tx
        .delete(embeddingChunk)
        .where(eq(embeddingChunk.organizationId, ctx.organizationId));
      await tx
        .update(knowledgeDocument)
        .set({
          embedding: null,
          embeddingModel: null,
          embeddingUpdatedAt: null,
        })
        .where(eq(knowledgeDocument.organizationId, ctx.organizationId));
      await tx
        .update(memory)
        .set({
          embedding: null,
          embeddingModel: null,
          embeddingUpdatedAt: null,
        })
        .where(eq(memory.organizationId, ctx.organizationId));
      return true;
    });
    return c.json({ config, reindexRequired: changed && config.enabled });
  },
);

router.post(
  "/embedding-settings/reindex",
  requireAuth,
  rateLimit({
    limit: 120,
    windowMs: 60000,
    keyResolver: (c) => `embedding-reindex:${c.var.user!.id}`,
  }),
  zValidator(
    "json",
    z.object({
      kind: z.enum(["knowledge", "memory"]),
      knowledgeBaseId: z.uuid().optional(),
      cursor: z.uuid().optional(),
      limit: z.number().int().min(1).max(5).default(1),
    }),
  ),
  async (c) => {
    const ctx = await context(c);
    const { kind, knowledgeBaseId, cursor, limit } = c.req.valid("json");
    if (kind === "knowledge" && !ctx.knowledgeManager)
      throw new ForbiddenError("Knowledge management permission is required");
    const preferences = await getEmbeddingPreferences(ctx.organizationId);
    const config = await resolveEmbeddingConfig(ctx.userId, preferences);
    if (!config)
      throw new BadRequestError(
        "Semantic indexing is disabled or no embedding provider credential is available",
      );
    let indexed = 0;
    const failures: Array<{ id: string; message: string }> = [];
    const rows =
      kind === "knowledge"
        ? await db.query.knowledgeDocument.findMany({
            where: and(
              eq(knowledgeDocument.organizationId, ctx.organizationId),
              knowledgeBaseId
                ? eq(knowledgeDocument.knowledgeBaseId, knowledgeBaseId)
                : undefined,
              or(
                isNull(knowledgeDocument.embedding),
                ne(knowledgeDocument.embeddingModel, config.identity),
              ),
              cursor ? gt(knowledgeDocument.id, cursor) : undefined,
            ),
            orderBy: asc(knowledgeDocument.id),
            limit,
          })
        : await db.query.memory.findMany({
            where: and(
              eq(memory.organizationId, ctx.organizationId),
              or(
                and(eq(memory.scope, "user"), eq(memory.userId, ctx.userId)),
                ctx.memoryManager && ctx.memoryReader
                  ? eq(memory.scope, "organization")
                  : undefined,
              ),
              or(
                isNull(memory.embedding),
                ne(memory.embeddingModel, config.identity),
              ),
              cursor ? gt(memory.id, cursor) : undefined,
            ),
            orderBy: asc(memory.id),
            limit,
          });
    for (const row of rows) {
      try {
        if ("title" in row) {
          if (
            row.contentType.startsWith("image/") &&
            !row.metadata.visionIndexedAt
          ) {
            const assetKey = getKnowledgeAssetKey(row.metadata);
            if (!assetKey)
              throw new Error("Image source is unavailable; upload it again");
            const buffer = await storageManager.download({
              context: "knowledge-base",
              key: assetKey,
            });
            const result = await refreshKnowledgeImageDocument({
              documentId: row.id,
              title: row.title,
              contentType: row.contentType,
              fileName: getKnowledgeImageFileName(row),
              existingMetadata: row.metadata,
              buffer,
              userId: ctx.userId,
            });
            if (result.embeddingIndexed) indexed++;
            else
              failures.push({
                id: row.id,
                message:
                  "Image extraction requires a working vision model and embedding provider",
              });
            continue;
          }
          if (
            await refreshKnowledgeDocumentEmbedding({
              documentId: row.id,
              title: row.title,
              content: row.content,
              userId: ctx.userId,
              signal: c.req.raw.signal,
            })
          )
            indexed++;
          else
            failures.push({
              id: row.id,
              message: "Source or settings changed during indexing; retry",
            });
        } else {
          const result = await createMemoryEmbedding({
            key: row.key,
            content: row.content,
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            signal: c.req.raw.signal,
          });
          if (!result) {
            failures.push({
              id: row.id,
              message:
                "Embedding provider unavailable; test the connection and retry",
            });
            continue;
          }
          const saved = await writeMemoryWithEmbedding(
            ctx.organizationId,
            result,
            async (tx, fields) => {
              const [updated] = await tx
                .update(memory)
                .set(fields)
                .where(
                  and(
                    eq(memory.id, row.id),
                    eq(memory.content, row.content),
                    eq(memory.key, row.key),
                  ),
                )
                .returning();
              return updated;
            },
          );
          if (saved.indexed) indexed++;
          else
            failures.push({
              id: row.id,
              message: "Source or settings changed during indexing; retry",
            });
        }
      } catch (error) {
        failures.push({
          id: row.id,
          message: error instanceof Error ? error.message : "Indexing failed",
        });
      }
    }
    return c.json({
      indexed,
      failures,
      processed: rows.length,
      cursor: rows.at(-1)?.id,
      done: rows.length < limit,
    });
  },
);
export default router;
