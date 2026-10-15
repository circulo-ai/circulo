import { describe, expect, it } from "vitest";
import {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from "./embedding-utils";

describe("knowledge embedding preparation", () => {
  it("keeps chunk overlap bounded for large documents", () => {
    const chunks = chunkKnowledgeText("a".repeat(24_000));

    expect(chunks).toHaveLength(4);
    expect(chunks.every((chunk) => chunk.length <= 12_000)).toBe(true);
    expect(chunks[0]?.slice(-400)).toBe(chunks[1]?.slice(0, 400));
    expect(chunks[1]?.slice(-400)).toBe(chunks[2]?.slice(0, 400));
  });

  it("honors configurable boundaries, overlap, and Unicode token budgets", () => {
    const chunks = chunkKnowledgeText("字😀".repeat(8000), {
      chunkSize: 4000,
      overlap: 100,
      strategy: "paragraph",
    });
    expect(
      chunks.every((chunk) => Buffer.byteLength(chunk, "utf8") <= 7800),
    ).toBe(true);
    expect(
      chunks.every(
        (chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk),
      ),
    ).toBe(true);
    expect(() =>
      chunkKnowledgeText("text", { chunkSize: 1000, overlap: 1000 }),
    ).toThrow("Invalid");
  });

  it("uses paragraph boundaries without dropping source content", () => {
    const source = `${"first ".repeat(50)}\n\n${"second ".repeat(80)}`;
    const chunks = chunkKnowledgeText(source, {
      chunkSize: 500,
      overlap: 0,
      strategy: "paragraph",
    });
    expect(chunks.join("")).toBe(source.trim());
    expect(chunks[0]).toContain("first");
    expect(chunks[0]).not.toContain("second");
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
