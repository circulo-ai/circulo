import { account, db } from "@/db";
import {
  hasPermissionForUser,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { tool, type ToolSet } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createGithubClient, repositorySummary } from "./github-client";

const GITHUB_PROVIDER_ID = "github-repo";
const GITHUB_API = "https://api.github.com";

type GithubAccount = {
  id: string;
  accountId: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
};

export async function getGithubAccountForUser(
  userId: string,
  allowedConnectionIds?: string[],
): Promise<GithubAccount | null> {
  if (allowedConnectionIds !== undefined && allowedConnectionIds.length === 0) {
    return null;
  }
  const [connectedAccount] = await db
    .select({
      id: account.id,
      accountId: account.accountId,
      accessToken: account.accessToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
    })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GITHUB_PROVIDER_ID),
        ...(allowedConnectionIds
          ? [inArray(account.id, allowedConnectionIds)]
          : []),
      ),
    )
    .limit(1);
  return connectedAccount ?? null;
}

function isExpired(accountRow: GithubAccount) {
  return (
    accountRow.accessTokenExpiresAt !== null &&
    accountRow.accessTokenExpiresAt.getTime() <= Date.now()
  );
}

export async function getGithubTools(params: {
  userId: string;
  organizationId: string;
  allowedToolIds?: string[];
  allowedConnectionIds?: string[];
  apiKeyPermissions?: ApiKeyPermissions;
}): Promise<ToolSet> {
  if (
    !(await hasPermissionForUser(
      params.userId,
      params.organizationId,
      "apps",
      "read",
      params.apiKeyPermissions,
    ))
  ) {
    return {};
  }
  const accountRow = await getGithubAccountForUser(
    params.userId,
    params.allowedConnectionIds,
  );
  if (!accountRow?.accessToken || isExpired(accountRow)) return {};

  const client = createGithubClient(accountRow.accessToken);
  const isAllowed = (toolId: string) =>
    params.allowedToolIds === undefined ||
    params.allowedToolIds.includes("app:github") ||
    params.allowedToolIds.includes(toolId);
  const tools: ToolSet = {};

  if (isAllowed("githubListRepositories")) {
    tools.githubListRepositories = tool({
      description:
        "List repositories visible to the connected GitHub account. This is read-only.",
      inputSchema: z.object({
        visibility: z.enum(["all", "public", "private"]).default("all"),
        affiliation: z
          .string()
          .max(100)
          .default("owner,collaborator,organization_member"),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => ({
        account: accountRow.accountId,
        repositories: (
          await client.listRepositories({
            ...input,
            affiliation:
              input.affiliation ?? "owner,collaborator,organization_member",
          })
        ).map(repositorySummary),
      }),
    });
  }

  if (isAllowed("githubGetRepository")) {
    tools.githubGetRepository = tool({
      description:
        "Read metadata for one GitHub repository. This is read-only.",
      inputSchema: z.object({
        owner: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(100),
      }),
      execute: async ({ owner, name }) => ({
        account: accountRow.accountId,
        repository: repositorySummary(await client.getRepository(owner, name)),
      }),
    });
  }

  if (isAllowed("githubSearchRepositories")) {
    tools.githubSearchRepositories = tool({
      description:
        "Search GitHub repositories using the connected account. This is read-only.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(256),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ query, limit }) => {
        const result = await client.searchRepositories(query, limit);
        return {
          account: accountRow.accountId,
          totalCount: result.total_count,
          repositories: result.items.map(repositorySummary),
        };
      },
    });
  }

  return tools;
}
