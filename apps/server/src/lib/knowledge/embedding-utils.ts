export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

const MAX_INPUT_CHARACTERS_PER_CHUNK = 12_000;
const CHUNK_OVERLAP_CHARACTERS = 400;

export function chunkKnowledgeText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_INPUT_CHARACTERS_PER_CHUNK) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(
      normalized.length,
      start + MAX_INPUT_CHARACTERS_PER_CHUNK,
    );
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
  }
  return chunks;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function averageKnowledgeEmbeddings(vectors: number[][]): number[] {
  const result = Array.from(
    { length: KNOWLEDGE_EMBEDDING_DIMENSIONS },
    () => 0,
  );
  for (const vector of vectors) {
    for (let index = 0; index < result.length; index += 1) {
      result[index] = (result[index] ?? 0) + (vector[index] ?? 0);
    }
  }
  return normalizeVector(result.map((value) => value / vectors.length));
}

export function isKnowledgeEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === KNOWLEDGE_EMBEDDING_DIMENSIONS &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}
