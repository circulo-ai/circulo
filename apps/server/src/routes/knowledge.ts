import { db } from "@/db";
import { knowledgeBase, knowledgeDocument } from "@/db/schema";
import { enforceOrganizationFeatureLimit } from "@/lib/billing/limits";
import { createRouter } from "@/lib/create-app";
import {
  getKnowledgeAssetKey,
  getKnowledgeImageContentType,
  getKnowledgeImageInlineLimit,
  hasKnowledgeImageSignature,
} from "@/lib/knowledge/assets";
import {
  createKnowledgeEmbedding,
  refreshKnowledgeDocumentEmbedding,
} from "@/lib/knowledge/embeddings";
import {
  getKnowledgeImageFileName,
  refreshKnowledgeImageDocument,
} from "@/lib/knowledge/vision";
import { hasPermissionForUser, isMemberOf } from "@/lib/permissions";
import { storageManager } from "@/lib/storage/config";
import { requireAuth } from "@/middleware/auth";
import { parseBuffer } from "@circulo-ai/file-parsers";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/create-app";

const router = createRouter();
const idParams = z.object({ id: z.uuid() });
const documentParams = z.object({ id: z.uuid(), documentId: z.uuid() });

const baseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
});

const documentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().max(500_000),
  sourceKey: z.string().trim().max(1000).nullable().optional(),
  contentType: z.string().trim().max(200).default("text/plain"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function getActiveOrganization(c: Context<AppEnv>) {
  const organizationId = c.get("activeOrgId");
  if (!organizationId) throw new BadRequestError("No active organization");
  if (!(await isMemberOf(c.var.user!.id, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }
  return organizationId;
}

async function requireOrganizationManager(
  userId: string,
  organizationId: string,
) {
  if (
    !(await hasPermissionForUser(userId, organizationId, "knowledge", "manage"))
  ) {
    throw new ForbiddenError(
      "Only workspace owners and admins can manage knowledge bases",
    );
  }
}

async function getBase(id: string, organizationId: string) {
  const base = await db.query.knowledgeBase.findFirst({
    where: and(
      eq(knowledgeBase.id, id),
      eq(knowledgeBase.organizationId, organizationId),
    ),
    with: { documents: true },
  });
  if (!base) throw new NotFoundError("Knowledge base not found");
  return base;
}

router.get("/knowledge-bases", requireAuth, async (c) => {
  const organizationId = await getActiveOrganization(c);
  const bases = await db.query.knowledgeBase.findMany({
    where: eq(knowledgeBase.organizationId, organizationId),
    with: { documents: true },
    orderBy: desc(knowledgeBase.updatedAt),
  });
  return c.json(
    bases.map(({ documents, ...base }) => ({
      ...base,
      documentCount: documents.length,
    })),
  );
});

router.post(
  "/knowledge-bases",
  requireAuth,
  zValidator("json", baseSchema),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const body = c.req.valid("json");
    const [baseCount] = await db
      .select({ current: count() })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.organizationId, organizationId),
          eq(knowledgeBase.isArchived, false),
        ),
      );
    await enforceOrganizationFeatureLimit({
      organizationId,
      feature: "kb_slots",
      current: Number(baseCount?.current ?? 0),
      resourceName: "Knowledge base",
    });
    const [created] = await db
      .insert(knowledgeBase)
      .values({
        organizationId,
        createdBy: c.var.user!.id,
        name: body.name,
        description: body.description ?? null,
      })
      .returning();
    return c.json(created, 201);
  },
);

router.patch(
  "/knowledge-bases/:id",
  requireAuth,
  zValidator("param", idParams),
  zValidator("json", baseSchema.partial()),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);
    const [updated] = await db
      .update(knowledgeBase)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeBase.id, id),
          eq(knowledgeBase.organizationId, organizationId),
        ),
      )
      .returning();
    return c.json(updated);
  },
);

router.delete(
  "/knowledge-bases/:id",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);
    await db
      .delete(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, id),
          eq(knowledgeBase.organizationId, organizationId),
        ),
      );
    return c.json({ deleted: true });
  },
);

router.get(
  "/knowledge-bases/:id/documents",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    const { id } = c.req.valid("param");
    const base = await getBase(id, organizationId);
    return c.json(base.documents);
  },
);

router.get(
  "/knowledge-bases/:id/search",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);
    const query = z
      .object({
        q: z.string().trim().min(1).max(500),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .parse(c.req.query());
    const queryEmbedding = await createKnowledgeEmbedding(query.q, "").catch(
      () => null,
    );
    const lexicalMatch = sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${query.q})`;
    const vectorDistance = queryEmbedding
      ? sql<number>`${knowledgeDocument.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`
      : null;
    return c.json(
      await db.query.knowledgeDocument.findMany({
        where: and(
          eq(knowledgeDocument.knowledgeBaseId, id),
          eq(knowledgeDocument.organizationId, organizationId),
          eq(knowledgeDocument.status, "ready"),
          queryEmbedding
            ? or(
                sql`${knowledgeDocument.embedding} IS NOT NULL`,
                lexicalMatch,
                sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
              )
            : or(
                lexicalMatch,
                sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
              ),
        ),
        orderBy: queryEmbedding
          ? [
              asc(
                sql`CASE WHEN ${knowledgeDocument.embedding} IS NULL THEN 1 ELSE 0 END`,
              ),
              asc(vectorDistance!),
              desc(
                sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${query.q}))`,
              ),
            ]
          : desc(
              sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${query.q}))`,
            ),
        limit: query.limit,
      }),
    );
  },
);

router.post(
  "/knowledge-bases/:id/documents",
  requireAuth,
  zValidator("param", idParams),
  zValidator("json", documentSchema),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);
    const body = c.req.valid("json");
    if (!body.content.trim()) throw new BadRequestError("Document is empty");
    const [created] = await db
      .insert(knowledgeDocument)
      .values({
        knowledgeBaseId: id,
        organizationId,
        createdBy: c.var.user!.id,
        title: body.title,
        content: body.content,
        sourceKey: body.sourceKey ?? null,
        contentType: body.contentType,
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) throw new Error("Knowledge document insert returned no row");
    void refreshKnowledgeDocumentEmbedding({
      documentId: created.id,
      title: created.title,
      content: created.content,
    }).catch((error) => {
      console.warn("[Knowledge Embedding] document indexing skipped", {
        documentId: created.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
    return c.json(created, 201);
  },
);

router.post(
  "/knowledge-bases/:id/documents/upload",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);

    const body = await c.req.parseBody();
    const uploaded = body.file;
    if (!(uploaded instanceof File)) {
      throw new BadRequestError("Choose a document to upload");
    }
    if (uploaded.size > 25 * 1024 * 1024) {
      throw new BadRequestError("Documents must be 25 MB or smaller");
    }

    const extension = uploaded.name.split(".").pop()?.toLowerCase();
    if (!extension) throw new BadRequestError("The document has no file type");
    const buffer = Buffer.from(await uploaded.arrayBuffer());
    const imageContentType = getKnowledgeImageContentType(
      uploaded.name,
      uploaded.type,
    );
    const titleValue = body.title;
    const title =
      typeof titleValue === "string" && titleValue.trim()
        ? titleValue.trim()
        : uploaded.name;

    if (imageContentType) {
      if (!hasKnowledgeImageSignature(buffer, imageContentType)) {
        throw new BadRequestError("The image file is not a valid raster image");
      }
      const documentId = crypto.randomUUID();
      const asset = await storageManager.upload({
        context: "knowledge-base",
        file: buffer,
        fileName: uploaded.name,
        contentType: imageContentType,
        customKey: `documents/${documentId}.${extension}`,
        preserveKey: true,
      });
      try {
        const [created] = await db
          .insert(knowledgeDocument)
          .values({
            id: documentId,
            knowledgeBaseId: id,
            organizationId,
            createdBy: c.var.user!.id,
            title: title.slice(0, 300),
            content: `Image attachment: ${uploaded.name}`,
            sourceKey: uploaded.name,
            contentType: imageContentType,
            metadata: {
              originalFileName: uploaded.name,
              assetKey: asset.key,
              assetSize: buffer.length,
              image: true,
              parser: "storage-backed-image",
              inlineContextLimit: getKnowledgeImageInlineLimit(),
            },
          })
          .returning();
        if (!created) throw new Error("Knowledge image insert returned no row");
        void refreshKnowledgeImageDocument({
          documentId: created.id,
          title: created.title,
          fileName: uploaded.name,
          contentType: imageContentType,
          buffer,
          existingMetadata: created.metadata,
        }).catch((error) => {
          console.warn("[Knowledge Vision] image indexing skipped", {
            documentId: created.id,
            error: error instanceof Error ? error.message : "unknown error",
          });
        });
        return c.json(created, 201);
      } catch (error) {
        await storageManager
          .delete({ context: "knowledge-base", key: asset.key })
          .catch(() => undefined);
        throw error;
      }
    }

    let parsed: Awaited<ReturnType<typeof parseBuffer>>;
    try {
      parsed = await parseBuffer(buffer, extension);
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error
          ? error.message
          : "Unable to parse this document",
      );
    }
    if (!parsed.content.trim()) {
      throw new BadRequestError("The document did not contain readable text");
    }
    if (parsed.content.length > 500_000) {
      throw new BadRequestError(
        "Parsed document text is too large; split it into smaller files",
      );
    }

    const [created] = await db
      .insert(knowledgeDocument)
      .values({
        knowledgeBaseId: id,
        organizationId,
        createdBy: c.var.user!.id,
        title: title.slice(0, 300),
        content: parsed.content,
        sourceKey: uploaded.name,
        contentType: uploaded.type || "application/octet-stream",
        metadata: {
          ...(parsed.metadata ?? {}),
          originalFileName: uploaded.name,
          parser: "@circulo-ai/file-parsers",
        },
      })
      .returning();
    if (!created) throw new Error("Knowledge document insert returned no row");
    void refreshKnowledgeDocumentEmbedding({
      documentId: created.id,
      title: created.title,
      content: created.content,
    }).catch((error) => {
      console.warn("[Knowledge Embedding] document indexing skipped", {
        documentId: created.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
    return c.json(created, 201);
  },
);

router.post(
  "/knowledge-bases/:id/reindex",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id } = c.req.valid("param");
    await getBase(id, organizationId);
    const documents = await db.query.knowledgeDocument.findMany({
      where: and(
        eq(knowledgeDocument.knowledgeBaseId, id),
        eq(knowledgeDocument.organizationId, organizationId),
        eq(knowledgeDocument.status, "ready"),
      ),
    });
    let indexed = 0;
    let visionIndexed = 0;
    for (const document of documents) {
      if (document.contentType.startsWith("image/")) {
        const assetKey =
          document.metadata && getKnowledgeAssetKey(document.metadata);
        if (!assetKey) continue;
        try {
          const buffer = await storageManager.download({
            context: "knowledge-base",
            key: assetKey,
          });
          const result = await refreshKnowledgeImageDocument({
            documentId: document.id,
            title: document.title,
            fileName: getKnowledgeImageFileName(document),
            contentType: document.contentType,
            buffer,
            existingMetadata: document.metadata,
          });
          if (result.visionIndexed) visionIndexed += 1;
          if (result.embeddingIndexed) indexed += 1;
        } catch (error) {
          console.warn("[Knowledge Vision] image reindex skipped", {
            documentId: document.id,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
        continue;
      }
      if (
        await refreshKnowledgeDocumentEmbedding({
          documentId: document.id,
          title: document.title,
          content: document.content,
        })
      ) {
        indexed += 1;
      }
    }
    return c.json({ total: documents.length, indexed, visionIndexed });
  },
);

router.patch(
  "/knowledge-bases/:id/documents/:documentId",
  requireAuth,
  zValidator("param", documentParams),
  zValidator("json", documentSchema.partial()),
  async (c) => {
    const organizationId = await getActiveOrganization(c);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id, documentId } = c.req.valid("param");
    await getBase(id, organizationId);
    const existing = await db.query.knowledgeDocument.findFirst({
      where: and(
        eq(knowledgeDocument.id, documentId),
        eq(knowledgeDocument.knowledgeBaseId, id),
        eq(knowledgeDocument.organizationId, organizationId),
      ),
    });
    if (!existing) throw new NotFoundError("Knowledge document not found");
    const [updated] = await db
      .update(knowledgeDocument)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(knowledgeDocument.id, documentId))
      .returning();
    return c.json(updated);
  },
);

router.delete(
  "/knowledge-bases/:id/documents/:documentId",
  requireAuth,
  zValidator("param", documentParams),
  async (c) => {
    const organizationId = await getActiveOrganization(c as never);
    await requireOrganizationManager(c.var.user!.id, organizationId);
    const { id, documentId } = c.req.valid("param");
    await getBase(id, organizationId);
    const existing = await db.query.knowledgeDocument.findFirst({
      where: and(
        eq(knowledgeDocument.id, documentId),
        eq(knowledgeDocument.knowledgeBaseId, id),
        eq(knowledgeDocument.organizationId, organizationId),
      ),
    });
    if (!existing) throw new NotFoundError("Knowledge document not found");
    const assetKey =
      typeof existing.metadata?.assetKey === "string"
        ? existing.metadata.assetKey
        : null;
    const deleted = await db
      .delete(knowledgeDocument)
      .where(
        and(
          eq(knowledgeDocument.id, documentId),
          eq(knowledgeDocument.knowledgeBaseId, id),
          eq(knowledgeDocument.organizationId, organizationId),
        ),
      )
      .returning({ id: knowledgeDocument.id });
    if (!deleted[0]) throw new NotFoundError("Knowledge document not found");
    if (assetKey) {
      await storageManager
        .delete({ context: "knowledge-base", key: assetKey })
        .catch(() => undefined);
    }
    return c.json({ deleted: true });
  },
);

export async function validateKnowledgeBaseIds(
  organizationId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const bases = await db
    .select({ id: knowledgeBase.id })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.organizationId, organizationId),
        inArray(knowledgeBase.id, ids),
        eq(knowledgeBase.isArchived, false),
      ),
    );
  if (bases.length !== new Set(ids).size) {
    throw new BadRequestError(
      "Every knowledge base must belong to the active organization",
    );
  }
}

export default router;
