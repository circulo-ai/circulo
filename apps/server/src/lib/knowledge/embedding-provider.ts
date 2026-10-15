import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  isKnowledgeEmbedding,
} from "./embedding-utils";

export async function requestEmbeddingVectors(
  config: { apiKey: string; baseUrl: string; model: string },
  inputs: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!inputs.length) return [];
  if (inputs.length > 256)
    throw new Error(
      "Document exceeds 256 embedding chunks. Increase chunk size or split the document.",
    );
  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
    : AbortSignal.timeout(45000);
  const output: number[][] = [];
  for (let start = 0; start < inputs.length; start += 16) {
    const batch = inputs.slice(start, start + 16);
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/embeddings`,
      {
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
        signal: AbortSignal.any([deadline, AbortSignal.timeout(30000)]),
      },
    );
    if (!response.ok)
      throw new Error(
        `Embedding provider returned HTTP ${response.status}. Check your provider credentials, balance, and model access.`,
      );
    const payload = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: unknown }>;
    };
    if (!Array.isArray(payload.data) || payload.data.length !== batch.length)
      throw new Error("Embedding provider returned an incomplete batch");
    const vectors: number[][] = new Array(batch.length);
    for (const item of payload.data) {
      if (
        !Number.isInteger(item.index) ||
        item.index! < 0 ||
        item.index! >= batch.length ||
        vectors[item.index!] ||
        !isKnowledgeEmbedding(item.embedding) ||
        !item.embedding.some((value) => value !== 0)
      )
        throw new Error(
          `Embedding provider must return unique indexed, finite, nonzero ${KNOWLEDGE_EMBEDDING_DIMENSIONS}-dimension vectors`,
        );
      vectors[item.index!] = item.embedding;
    }
    output.push(...vectors);
  }
  return output;
}
