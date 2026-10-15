export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

const MAX_INPUT_CHARACTERS_PER_CHUNK = 12_000;
const CHUNK_OVERLAP_CHARACTERS = 400;

export function chunkKnowledgeText(
  text: string,
  options: {
    chunkSize?: number;
    overlap?: number;
    strategy?: "fixed" | "paragraph";
  } = {},
): string[] {
  const size = options.chunkSize ?? MAX_INPUT_CHARACTERS_PER_CHUNK;
  const overlap = options.overlap ?? CHUNK_OVERLAP_CHARACTERS;
  if (
    !Number.isInteger(size) ||
    size < 256 ||
    size > 12000 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap >= size / 2
  )
    throw new Error("Invalid chunk size or overlap");
  const normalized = text.trim();
  if (!normalized) return [];
  if (
    normalized.length <= size &&
    Buffer.byteLength(normalized, "utf8") <= 7800
  )
    return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + size);
    // UTF-8 byte count is a conservative token bound, including CJK and emoji.
    while (Buffer.byteLength(normalized.slice(start, end), "utf8") > 7800) {
      const bytes = Buffer.byteLength(normalized.slice(start, end), "utf8");
      end = start + Math.max(1, Math.floor(((end - start) * 7800) / bytes));
    }
    if (options.strategy === "paragraph" && end < normalized.length) {
      const section = normalized.slice(start, end);
      const boundary = Math.max(
        section.lastIndexOf("\n\n"),
        section.lastIndexOf("\n"),
        section.lastIndexOf(". "),
      );
      if (boundary >= size / 2) end = start + boundary + 1;
    }
    if (
      end < normalized.length &&
      /[\uD800-\uDBFF]/u.test(normalized[end - 1] ?? "")
    )
      end--;
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = Math.max(end - overlap, start + 1);
    if (/[\uDC00-\uDFFF]/u.test(normalized[start] ?? "")) start++;
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
