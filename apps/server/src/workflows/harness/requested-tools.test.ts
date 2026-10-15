import { describe, expect, it } from "vitest";
import { requestedToolNames } from "./requested-tools";
const tools = {
  mcp_123_resolve_library_id: {
    description:
      "MCP integration: Context7 documentation. Remote tool: resolve-library-id. Resolve a library.",
  },
  mcp_123_query_docs: {
    description:
      "MCP integration: Context7 documentation. Remote tool: query-docs. Query current documentation.",
  },
  searchKnowledge: { description: "Search assigned knowledge" },
};
describe("explicit tool requests", () => {
  it("routes Context7 requests to real MCP tools without selecting knowledge search", () => {
    expect(
      requestedToolNames(
        "Use Context7 to query the docs for Better Auth",
        tools as never,
      ),
    ).toEqual(["mcp_123_resolve_library_id", "mcp_123_query_docs"]);
    expect(
      requestedToolNames(
        "@tool:query-docs Read the documentation",
        tools as never,
      ),
    ).toEqual(["mcp_123_resolve_library_id", "mcp_123_query_docs"]);
  });
  it("never grants tools that are absent and leaves ordinary conversation alone", () => {
    expect(requestedToolNames("Use Context7", {})).toEqual([]);
    expect(requestedToolNames("What is Context7?", tools as never)).toEqual([]);
    expect(requestedToolNames("Search my notes", tools as never)).toEqual([]);
  });
});
