import { db, knowledgeDocument } from "@/db";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { getKnowledgeAssetKey, toKnowledgeImageDataUrl } from "./assets";
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
}): Promise<string | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  const imageDataUrl = toKnowledgeImageDataUrl(
    params.buffer,
    params.contentType,
  );
  if (!imageDataUrl) return null;

  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
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
      model: getVisionModel(),
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
  });

  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 500);
    throw new Error(
      `Vision request failed (${response.status})${providerMessage ? `: ${providerMessage}` : ""}`,
    );
  }

  const payload = (await response.json()) as VisionResponse;
  return extractVisionText(payload.choices?.[0]?.message?.content);
}

export async function refreshKnowledgeImageDocument(params: {
  documentId: string;
  title: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  existingMetadata?: Record<string, unknown> | null;
}): Promise<{ visionIndexed: boolean; embeddingIndexed: boolean }> {
  const visionText = await createKnowledgeImageVisionText(params);
  if (!visionText) {
    return {
      visionIndexed: false,
      embeddingIndexed: await refreshKnowledgeDocumentEmbedding({
        documentId: params.documentId,
        title: params.title,
        content: `Image attachment: ${params.fileName}`,
      }),
    };
  }

  const content = buildImageKnowledgeContent(params.fileName, visionText);
  await db
    .update(knowledgeDocument)
    .set({
      content,
      metadata: {
        ...(params.existingMetadata ?? {}),
        visionIndexedAt: new Date().toISOString(),
        visionModel: getVisionModel(),
      },
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocument.id, params.documentId));

  return {
    visionIndexed: true,
    embeddingIndexed: await refreshKnowledgeDocumentEmbedding({
      documentId: params.documentId,
      title: params.title,
      content,
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
