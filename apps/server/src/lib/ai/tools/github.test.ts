import { describe, expect, it, vi } from "vitest";
import { createGithubClient } from "./github-client";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHub connector client", () => {
  it("sends read-only API requests with the scoped bearer token", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(new URL(input).pathname).toBe("/user/repos");
      expect(new URL(input).searchParams.get("per_page")).toBe("2");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token",
      );
      expect(
        (init?.headers as Record<string, string>)["X-GitHub-Api-Version"],
      ).toBe("2022-11-28");
      return response([
        {
          id: 1,
          full_name: "circulo-ai/circulo",
          name: "circulo",
          private: false,
          html_url: "https://github.com/circulo-ai/circulo",
          description: "A workspace",
          default_branch: "main",
          language: "TypeScript",
          stargazers_count: 4,
          forks_count: 1,
          updated_at: "2026-08-22T00:00:00Z",
        },
      ]);
    });

    const client = createGithubClient("test-token", fetchImpl);
    const repositories = await client.listRepositories({
      visibility: "all",
      affiliation: "owner",
      limit: 2,
    });

    expect(repositories[0]?.full_name).toBe("circulo-ai/circulo");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("surfaces provider failures without returning misleading data", async () => {
    const client = createGithubClient("test-token", async () =>
      response({ message: "Bad credentials" }, 401),
    );

    await expect(client.getRepository("owner", "repo")).rejects.toThrow(
      "Bad credentials",
    );
  });
});
