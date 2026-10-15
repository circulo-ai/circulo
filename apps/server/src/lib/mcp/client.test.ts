import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  integrations: [] as any[],
  allowed: true,
}));
vi.mock("@/db", () => ({
  db: {
    query: { mcpIntegration: { findMany: async () => fixtures.integrations } },
  },
}));
vi.mock("@/db/schema", () => ({ mcpIntegration: {} }));
vi.mock("@/lib/permissions", () => ({
  hasPermissionForUser: async () => fixtures.allowed,
}));

import { McpClient, getMcpToolsForAgent } from "./client";

describe("McpClient", () => {
  it("applies scopes additively and preserves per-tool agent allowlists", async () => {
    fixtures.allowed = true;
    const integrationId = "11111111-1111-4111-8111-111111111111";
    fixtures.integrations = [
      {
        id: integrationId,
        name: "Context7 documentation",
        links: [
          { enabled: true, scope: "organization", allowedTools: [] },
          {
            enabled: true,
            scope: "chat",
            chatId: "chat",
            allowedTools: ["resolve-library-id"],
          },
        ],
        tools: ["resolve-library-id", "query-docs"].map((name) => ({
          name,
          enabled: true,
          inputSchema: { type: "object" },
          approvalMode: "approve",
        })),
      },
    ];
    const params = {
      organizationId: "org",
      chatId: "chat",
      workflowId: "run",
      session: { userId: "owner" },
      dataStream: { write() {} } as never,
    };
    const tools = await getMcpToolsForAgent(params);
    expect(Object.keys(tools)).toHaveLength(2);
    const queryName = Object.keys(tools).find((name) =>
      name.endsWith("query_docs"),
    )!;
    expect(
      Object.keys(
        await getMcpToolsForAgent({
          ...params,
          allowedIntegrationIds: [queryName],
        }),
      ),
    ).toEqual([queryName]);
    fixtures.allowed = false;
    expect(await getMcpToolsForAgent(params)).toEqual({});
    fixtures.allowed = true;
    fixtures.integrations = [];
  });
  it("preserves remote tool errors instead of returning successful content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        if (init?.method === "GET") return new Response(null, { status: 405 });
        const body = JSON.parse(String(init?.body));
        if (body.method === "notifications/initialized")
          return new Response(null, { status: 202 });
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "initialize"
              ? {
                  protocolVersion: "2025-06-18",
                  capabilities: { tools: {} },
                  serverInfo: { name: "fixture", version: "1" },
                }
              : {
                  isError: true,
                  content: [{ type: "text", text: "Action failed" }],
                },
        });
      }),
    );
    const client = new McpClient({
      endpoint: "http://127.0.0.1:8787/mcp",
      transport: "streamable_http",
      credentialRef: null,
    } as never);
    await expect(client.callTool("action", {})).rejects.toThrow(
      "execution error",
    );
  });
  it("initializes once per operation and forwards the negotiated MCP session", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        if (init?.method === "GET") return new Response(null, { status: 405 });
        calls.push(init!);
        const body = JSON.parse(String(init?.body));
        if (body.method === "notifications/initialized")
          return new Response(null, { status: 202 });
        return Response.json(
          {
            jsonrpc: "2.0",
            id: body.id,
            result:
              body.method === "initialize"
                ? {
                    protocolVersion: "2025-06-18",
                    capabilities: { tools: {} },
                    serverInfo: { name: "fixture", version: "1" },
                  }
                : {
                    tools: [{ name: "echo", inputSchema: { type: "object" } }],
                  },
          },
          {
            headers:
              body.method === "initialize"
                ? { "Mcp-Session-Id": "session-1" }
                : {},
          },
        );
      }),
    );
    const client = new McpClient({
      endpoint: "http://127.0.0.1:8787/mcp",
      transport: "streamable_http",
      credentialRef: null,
    } as never);
    await expect(client.listTools()).resolves.toMatchObject([{ name: "echo" }]);
    expect(calls).toHaveLength(3);
    expect(new Headers(calls[1]!.headers).get("mcp-session-id")).toBe(
      "session-1",
    );
    expect(new Headers(calls[2]!.headers).get("mcp-session-id")).toBe(
      "session-1",
    );
    expect(new Headers(calls[2]!.headers).get("mcp-protocol-version")).toBe(
      "2025-06-18",
    );
  });
});
