import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateProviderCost } from "./cost";
import {
  getDefaultModelForProvider,
  listProviderModels,
  redactProviderError,
} from "./provider-registry";

describe("AI provider registry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps provider-specific default models stable", () => {
    expect(getDefaultModelForProvider("openai")).toBe("gpt-4o-mini");
    expect(getDefaultModelForProvider("anthropic")).toBe("claude-sonnet-4-5");
    expect(getDefaultModelForProvider("google")).toBe("gemini-2.5-flash");
    expect(getDefaultModelForProvider("ollama")).toBe("llama3.2");
  });

  it("filters OpenRouter model discovery to tool-capable generation models", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "acme/chat",
                name: "Acme Chat",
                supported_parameters: ["tools"],
              },
              {
                id: "acme/embedding",
                name: "Acme Embeddings",
                supported_parameters: [],
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await listProviderModels({
      providerId: "openrouter",
      apiKey: "user-key",
      toolsOnly: true,
    });

    expect(models.map((candidate) => candidate.id)).toEqual([
      "acme/chat",
      "openrouter/free",
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer user-key",
      }),
    });
  });

  it("redacts credentials from provider errors", () => {
    const message = redactProviderError(
      new Error("Bearer super-secret key=another-secret"),
    );

    expect(message).not.toContain("super-secret");
    expect(message).not.toContain("another-secret");
    expect(message).toContain("[redacted]");
  });

  it("estimates direct-provider cost when provider metadata is absent", () => {
    expect(
      estimateProviderCost({
        providerId: "openai",
        modelId: "gpt-4o-mini",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(0.75);
    expect(
      estimateProviderCost({
        providerId: "ollama",
        modelId: "llama3.2",
        inputTokens: 10_000,
        outputTokens: 10_000,
      }),
    ).toBe(0);
  });
});
