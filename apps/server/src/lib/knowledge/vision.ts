import {
  db,
  embeddingChunk,
  embeddingPreference,
  knowledgeDocument,
} from "@/db";
import { getUserProviderCredential } from "@/lib/ai/provider-registry";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { getKnowledgeAssetKey, toKnowledgeImageDataUrl } from "./assets";
import { getEmbeddingPreferences } from "./embedding-settings";
import { refreshKnowledgeDocumentEmbedding } from "./embeddings";
import type { VisionMessageContent } from "./vision-utils";
import { buildImageKnowledgeContent, extractVisionText } from "./vision-utils";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_VISION_MODEL = "openai/gpt-4o-mini";

type VisionResponse = {
  choices?: Array<{
    message?: { content?: VisionMessageContent };
  }>;
};

function getBaseUrl() {
  return (env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL).replace(
    /\/$/,
    "",
  );
}

function getVisionModel() {
  return (
    env.CIRCULO_VISION_MODEL ??
    env.OPENROUTER_DEFAULT_MODEL ??
    DEFAULT_VISION_MODEL
  );
}

export async function createKnowledgeImageVisionText(params: {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  userId?: string;
}): Promise<{ content: string; model: string } | null> {
  const credential = params.userId
    ? ((await getUserProviderCredential(params.userId, "openrouter")) ??
      (await getUserProviderCredential(params.userId, "openai")))
    : null;
  const apiKey = credential?.apiKey ?? env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const baseUrl =
    credential?.baseUrl ??
    (credential?.providerId === "openai"
      ? "https://api.openai.com/v1"
      : getBaseUrl());
  const model =
    credential?.providerId === "openai" ? "gpt-4o-mini" : getVisionModel();
  const imageDataUrl = toKnowledgeImageDataUrl(
    params.buffer,
    params.contentType,
  );
  if (!imageDataUrl) return null;

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(env.OPENROUTER_HTTP_REFERER
          ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(env.OPENROUTER_APP_TITLE
          ? { "X-Title": env.OPENROUTER_APP_TITLE }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Index this image for knowledge retrieval. File name: ${params.fileName}. Extract readable text faithfully, then add a concise description of important visible entities, layout, and meaning. Use the headings "Readable text" and "Visual description". Do not invent details.`,
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Vision provider returned HTTP ${response.status}. Check credentials, balance, and vision-model access.`,
    );
  }

  const payload = (await response.json()) as VisionResponse;
  const content = extractVisionText(payload.choices?.[0]?.message?.content);
  return content ? { content, model } : null;
}

export async function refreshKnowledgeImageDocument(params: {
  documentId: string;
  title: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  existingMetadata?: Record<string, unknown> | null;
  userId?: string;
}): Promise<{ visionIndexed: boolean; embeddingIndexed: boolean }> {
  const source = await db.query.knowledgeDocument.findFirst({
    where: eq(knowledgeDocument.id, params.documentId),
  });
  if (!source || source.title !== params.title)
    return { visionIndexed: false, embeddingIndexed: false };
  await getEmbeddingPreferences(source.organizationId);
  const visionText = await createKnowledgeImageVisionText(params);
  if (!visionText) {
    return {
      visionIndexed: false,
      embeddingIndexed: false,
    };
  }

  const content = buildImageKnowledgeContent(
    params.fileName,
    visionText.content,
  );
  const saved = await db.transaction(async (tx) => {
    await tx
      .select()
      .from(embeddingPreference)
      .where(eq(embeddingPreference.organizationId, source.organizationId))
      .for("update");
    const [current] = await tx
      .select()
      .from(knowledgeDocument)
      .where(eq(knowledgeDocument.id, params.documentId))
      .for("update");
    if (
      !current ||
      current.updatedAt.getTime() !== source.updatedAt.getTime() ||
      current.content !== source.content
    )
      return false;
    await tx
      .delete(embeddingChunk)
      .where(eq(embeddingChunk.documentId, params.documentId));
    await tx
      .update(knowledgeDocument)
      .set({
        content,
        embedding: null,
        embeddingModel: null,
        embeddingUpdatedAt: null,
        metadata: {
          ...current.metadata,
          visionIndexedAt: new Date().toISOString(),
          visionModel: visionText.model,
        },
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocument.id, params.documentId));
    return true;
  });
  if (!saved) return { visionIndexed: false, embeddingIndexed: false };

  return {
    visionIndexed: true,
    embeddingIndexed: await refreshKnowledgeDocumentEmbedding({
      documentId: params.documentId,
      title: params.title,
      content,
      userId: params.userId,
    }),
  };
}

export function getKnowledgeImageFileName(document: {
  sourceKey: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const originalFileName = document.metadata?.originalFileName;
  return typeof originalFileName === "string" && originalFileName.trim()
    ? originalFileName
    : (document.sourceKey ?? "knowledge-image");
}

export { getKnowledgeAssetKey };
