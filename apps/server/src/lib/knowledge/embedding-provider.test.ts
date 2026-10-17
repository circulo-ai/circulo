import { embeddingPreferencesSchema } from "@circulo-ai/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestEmbeddingVectors } from "./embedding-provider";
const config = {
  apiKey: "test-credential",
  baseUrl: "https://provider.example/v1",
  model: "text-embedding-3-small",
};
const vector = (value: number) => Array.from({ length: 1536 }, () => value);
afterEach(() => vi.unstubAllGlobals());
describe("embedding provider protocol", () => {
  it("requests fixed dimensions and restores indexed response ordering", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { index: 1, embedding: vector(2) },
          { index: 0, embedding: vector(1) },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestEmbeddingVectors(config, ["one", "two"]);
    expect(result[0]?.[0]).toBe(1);
    expect(result[1]?.[0]).toBe(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).dimensions).toBe(1536);
  });
  it.each(["duplicate", "dimensions", "zero", "missing"])(
    "rejects %s provider responses",
    async (problem) => {
      const data =
        problem === "missing"
          ? []
          : [
              {
                index: 0,
                embedding:
                  problem === "dimensions"
                    ? [1]
                    : vector(problem === "zero" ? 0 : 1),
              },
              { index: problem === "duplicate" ? 0 : 1, embedding: vector(1) },
            ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ data })),
      );
      await expect(
        requestEmbeddingVectors(config, ["one", "two"]),
      ).rejects.toThrow();
    },
  );
  it("batches inputs and bounds total work", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) =>
      Response.json({
        data: JSON.parse(init.body).input.map(
          (_text: string, index: number) => ({
            index,
            embedding: vector(index + 1),
          }),
        ),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await requestEmbeddingVectors(
        config,
        Array.from({ length: 33 }, () => "test"),
      ),
    ).toHaveLength(33);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(
      requestEmbeddingVectors(
        config,
        Array.from({ length: 257 }, () => "test"),
      ),
    ).rejects.toThrow("256");
  });
  it("rejects invalid preferences and excessive overlap", () => {
    expect(
      embeddingPreferencesSchema.safeParse({ chunkSize: 1000, overlap: 500 })
        .success,
    ).toBe(false);
    expect(
      embeddingPreferencesSchema.safeParse({ provider: "invalid" }).success,
    ).toBe(false);
    expect(
      embeddingPreferencesSchema.safeParse({ chunkSize: 4000, overlap: 100 })
        .success,
    ).toBe(true);
  });
});
