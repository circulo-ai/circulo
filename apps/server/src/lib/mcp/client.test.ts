import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ mcpIntegration: {} }));

import { McpClient } from "./client";

describe("McpClient", () => {
  it("initializes once and forwards the MCP session to later requests", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        calls.push({ init });
        const body = JSON.parse(String(init?.body)) as { method: string };
        if (body.method === "initialize") {
          return new Response('{"jsonrpc":"2.0","result":{}}', {
            headers: { "Mcp-Session-Id": "session-1" },
          });
        }
        if (body.method === "notifications/initialized") {
          return new Response(null, { status: 202 });
        }
        return new Response(
          '{"jsonrpc":"2.0","result":{"tools":[{"name":"echo"}]}}',
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const client = new McpClient({
      endpoint: "http://127.0.0.1:8787/mcp",
      transport: "streamable_http",
      credentialRef: null,
    } as never);

    await expect(client.listTools()).resolves.toEqual([{ name: "echo" }]);
    expect(calls).toHaveLength(3);
    expect(calls[1]?.init?.headers).toMatchObject({
      "Mcp-Session-Id": "session-1",
    });
    expect(calls[2]?.init?.headers).toMatchObject({
      "Mcp-Session-Id": "session-1",
    });
  });
});
