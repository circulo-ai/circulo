import { describe, expect, it } from "vitest";
import {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from "./embedding-utils";

describe("knowledge embedding preparation", () => {
  it("keeps chunk overlap bounded for large documents", () => {
    const chunks = chunkKnowledgeText("a".repeat(24_000));

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 12_000)).toBe(true);
    expect(chunks[0]?.slice(-400)).toBe(chunks[1]?.slice(0, 400));
    expect(chunks[1]?.slice(-400)).toBe(chunks[2]?.slice(0, 400));
  });

  it("averages provider vectors and returns a unit-length vector", () => {
    const first = Array.from(
      { length: KNOWLEDGE_EMBEDDING_DIMENSIONS },
      () => 1,
    );
    const second = Array.from(
      { length: KNOWLEDGE_EMBEDDING_DIMENSIONS },
      () => 3,
    );

    const average = averageKnowledgeEmbeddings([first, second]);
    const magnitude = Math.sqrt(
      average.reduce((sum, value) => sum + value * value, 0),
    );

    expect(average).toHaveLength(KNOWLEDGE_EMBEDDING_DIMENSIONS);
    expect(magnitude).toBeCloseTo(1, 8);
    expect(average[0]).toBeCloseTo(1 / Math.sqrt(1536), 8);
  });
});
