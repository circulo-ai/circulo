import {
  createGoogleGenerativeAI,
  type GoogleEmbeddingModelOptions,
} from "@ai-sdk/google";
import { embedMany } from "ai";
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  isKnowledgeEmbedding,
} from "./embedding-utils";

export type EmbeddingProviderId = "openrouter" | "openai" | "google";
export type EmbeddingPurpose = "document" | "query";

export type EmbeddingProviderConfig = {
  provider?: EmbeddingProviderId;
  apiKey: string;
  baseUrl?: string;
  model: string;
};

export type EmbeddingRequestOptions = {
  purpose?: EmbeddingPurpose;
  documentTitle?: string;
};

const MAX_EMBEDDING_BATCH_SIZE = 16;
const MAX_EMBEDDING_INPUTS = 256;

function requestSignal(signal?: AbortSignal) {
  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
    : AbortSignal.timeout(45_000);
  return AbortSignal.any([deadline, AbortSignal.timeout(30_000)]);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function googleEmbeddingInput(
  model: string,
  value: string,
  options: EmbeddingRequestOptions,
): string {
  if (model !== "gemini-embedding-2") return value;
  if (options.purpose === "query")
    return `task: search result | query: ${value}`;
  return `title: ${options.documentTitle?.trim() || "none"} | text: ${value}`;
}

function safeGoogleFailure(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted)
    return new Error("Google AI embedding request was cancelled or timed out.");
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
  const status = typeof statusCode === "number" ? ` (HTTP ${statusCode})` : "";
  return new Error(
    `Google AI embedding request failed${status}. Check the API key, quota, and model access.`,
  );
}

function validateVectors(
  vectors: unknown,
  expectedCount: number,
  providerName: string,
): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount)
    throw new Error(`${providerName} returned an incomplete embedding batch`);
  const normalized: number[][] = [];
  for (const vector of vectors) {
    if (!isKnowledgeEmbedding(vector) || !vector.some((value) => value !== 0))
      throw new Error(
        `${providerName} must return finite, nonzero ${KNOWLEDGE_EMBEDDING_DIMENSIONS}-dimension vectors`,
      );
    normalized.push(vector);
  }
  return normalized;
}

async function requestGoogleEmbeddingBatch(
  config: EmbeddingProviderConfig,
  batch: string[],
  signal: AbortSignal,
  options: EmbeddingRequestOptions,
): Promise<number[][]> {
  const google = createGoogleGenerativeAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  const googleOptions = {
    outputDimensionality: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    ...(config.model === "gemini-embedding-001"
      ? {
          taskType:
            options.purpose === "query"
              ? ("RETRIEVAL_QUERY" as const)
              : ("RETRIEVAL_DOCUMENT" as const),
        }
      : {}),
  } satisfies GoogleEmbeddingModelOptions;

  let embeddings: number[][];
  try {
    const result = await embedMany({
      model: google.embedding(config.model),
      values: batch.map((value) =>
        googleEmbeddingInput(config.model, value, options),
      ),
      providerOptions: { google: googleOptions },
      abortSignal: signal,
    });
    embeddings = result.embeddings;
  } catch (error) {
    throw safeGoogleFailure(error, signal);
  }

  const vectors = validateVectors(embeddings, batch.length, "Google AI");
  return config.model === "gemini-embedding-001"
    ? vectors.map(normalizeVector)
    : vectors;
}

async function requestOpenAiCompatibleBatch(
  config: EmbeddingProviderConfig,
  batch: string[],
  signal: AbortSignal,
): Promise<number[][]> {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: batch,
        dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
        encoding_format: "float",
      }),
      signal,
    });
  } catch {
    throw new Error(
      signal.aborted
        ? "Embedding provider request was cancelled or timed out."
        : "Embedding provider request failed. Check the network and provider endpoint.",
    );
  }

  if (!response.ok)
    throw new Error(
      `Embedding provider returned HTTP ${response.status}. Check your provider credentials, balance, and model access.`,
    );

  let payload: {
    data?: Array<{ index?: number; embedding?: unknown }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("Embedding provider returned an invalid response.");
  }
  if (!Array.isArray(payload.data) || payload.data.length !== batch.length)
    throw new Error("Embedding provider returned an incomplete batch");

  const vectors: unknown[] = new Array(batch.length);
  for (const item of payload.data) {
    if (
      !Number.isInteger(item.index) ||
      item.index! < 0 ||
      item.index! >= batch.length ||
      vectors[item.index!] !== undefined
    )
      throw new Error("Embedding provider returned invalid vector indexes");
    vectors[item.index!] = item.embedding;
  }
  return validateVectors(vectors, batch.length, "Embedding provider");
}

export async function requestEmbeddingVectors(
  config: EmbeddingProviderConfig,
  inputs: string[],
  signal?: AbortSignal,
  options: EmbeddingRequestOptions = {},
): Promise<number[][]> {
  if (!inputs.length) return [];
  if (inputs.length > MAX_EMBEDDING_INPUTS)
    throw new Error(
      `Document exceeds ${MAX_EMBEDDING_INPUTS} embedding chunks. Increase chunk size or split the document.`,
    );

  const output: number[][] = [];
  for (
    let start = 0;
    start < inputs.length;
    start += MAX_EMBEDDING_BATCH_SIZE
  ) {
    const batch = inputs.slice(start, start + MAX_EMBEDDING_BATCH_SIZE);
    const batchSignal = requestSignal(signal);
    const vectors =
      config.provider === "google"
        ? await requestGoogleEmbeddingBatch(config, batch, batchSignal, options)
        : await requestOpenAiCompatibleBatch(config, batch, batchSignal);
    output.push(...vectors);
  }
  return output;
}
