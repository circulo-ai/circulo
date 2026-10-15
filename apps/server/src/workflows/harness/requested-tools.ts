import type { ToolSet } from "ai";

/** Resolve requests against tools already granted; mentions grant no access. */
export function requestedToolNames(goal: string, tools: ToolSet): string[] {
  const text = goal.toLowerCase();
  const mentions = [...text.matchAll(/@(?:tool|mcp)[:/_-]([^\s@]+)/g)].map(
    (match) => match[1]!.replace(/[.,!?;]+$/, ""),
  );
  const directsMcp =
    /\b(use|using|via|query|retrieve|fetch|search|look up)\b/i.test(goal);
  const requested = Object.entries(tools)
    .filter(([name, definition]) => {
      const description =
        typeof definition.description === "string"
          ? definition.description
          : "";
      const remote = /Remote tool: ([^.]+)\./.exec(description)?.[1];
      if (
        mentions.some(
          (key) =>
            key === name.toLowerCase() ||
            key === remote?.toLowerCase() ||
            name.startsWith(
              `mcp_${key.replace(/^mcp:/, "").replaceAll("-", "_")}_`,
            ),
        )
      )
        return true;
      if (!name.startsWith("mcp_") || !directsMcp) return false;
      const integration = /MCP integration: ([^.]+)\./
        .exec(description)?.[1]
        ?.toLowerCase();
      const distinctName = integration
        ?.split(/\s+/)
        .find((word) => /\d/.test(word));
      return Boolean(
        (remote && text.includes(remote.toLowerCase())) ||
        (integration && text.includes(integration)) ||
        (distinctName && text.split(/[^a-z0-9]+/).includes(distinctName)),
      );
    })
    .map(([name]) => name);
  if (
    !/(?:^|\s)\/[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[^\s]+)?(?:$|\s)/i.test(goal)
  ) {
    for (const name of [...requested]) {
      const description = tools[name]?.description;
      if (
        typeof description !== "string" ||
        !description.includes("Context7") ||
        !name.endsWith("_query_docs")
      )
        continue;
      const resolver = name.replace(/query_docs$/, "resolve_library_id");
      if (tools[resolver] && !requested.includes(resolver))
        requested.unshift(resolver);
    }
  }
  return requested;
}
