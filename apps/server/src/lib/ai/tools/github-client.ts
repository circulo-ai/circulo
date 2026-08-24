const GITHUB_API = "https://api.github.com";

type GithubFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type GithubRepository = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  owner?: { login?: string };
};

export function createGithubClient(
  accessToken: string,
  fetchImpl: GithubFetch = fetch,
) {
  async function request<T>(path: string, query?: Record<string, string>) {
    const url = new URL(path, GITHUB_API);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "circulo-ai",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : `GitHub returned HTTP ${response.status}`;
      throw new Error(message);
    }
    return body as T;
  }

  return {
    listRepositories: (params: {
      visibility: "all" | "public" | "private";
      affiliation: string;
      limit: number;
    }) =>
      request<GithubRepository[]>("/user/repos", {
        visibility: params.visibility,
        affiliation: params.affiliation,
        per_page: String(params.limit),
        sort: "updated",
        direction: "desc",
      }),
    getRepository: (owner: string, name: string) =>
      request<GithubRepository>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      ),
    searchRepositories: (query: string, limit: number) =>
      request<{ total_count: number; items: GithubRepository[] }>(
        "/search/repositories",
        { q: query, per_page: String(limit) },
      ),
  };
}

export function repositorySummary(repository: GithubRepository) {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    owner: repository.owner?.login ?? repository.full_name.split("/")[0],
    private: repository.private,
    url: repository.html_url,
    description: repository.description,
    defaultBranch: repository.default_branch,
    language: repository.language,
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    updatedAt: repository.updated_at,
  };
}
