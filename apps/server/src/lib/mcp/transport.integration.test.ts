import { createServer, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { McpClient } from "./client";
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ mcpIntegration: {} }));
vi.mock("@/lib/permissions", () => ({
  hasPermissionForUser: async () => true,
}));
let origin = "";
let legacy: ServerResponse | undefined;
const calls: Array<{ method: string; params: any }> = [];
let observePending: (() => void) | undefined;
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/sse") {
    legacy = res;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write("event: endpoint\ndata: /messages\n\n");
    return;
  }
  if (req.method === "GET") {
    res.writeHead(405).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (!body.id && body.id !== 0) {
    res.writeHead(202).end();
    return;
  }
  calls.push({ method: body.method, params: body.params });
  if (body.method === "tools/call" && body.params.name === "pending") {
    observePending?.();
    return;
  }
  const result =
    body.method === "initialize"
      ? {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        }
      : body.method === "tools/list"
        ? {
            tools: [
              {
                name: body.params.cursor ? "omega" : "alpha",
                inputSchema: { type: "object" },
              },
            ],
            ...(!body.params.cursor ? { nextCursor: "second-page" } : {}),
          }
        : {
            content: [{ type: "text", text: "Fixture response" }],
            structuredContent: { verified: true },
          };
  const rpc = JSON.stringify({ jsonrpc: "2.0", id: body.id, result });
  if (req.url === "/messages") {
    res.writeHead(202).end();
    legacy!.write(`event: message\ndata: ${rpc}\n\n`);
  } else {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      ...(body.method === "initialize"
        ? { "Mcp-Session-Id": "fixture-session" }
        : {}),
    });
    res.write(`event: message\ndata: ${rpc}\n\n`);
    // Keep the stream open: the client must resolve the matching RPC result
    // without incorrectly waiting for EOF, and then release its connection.
  }
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const client = (transport: "sse" | "streamable_http") =>
  new McpClient({
    endpoint: `${origin}/${transport === "sse" ? "sse" : "mcp"}`,
    transport,
    credentialRef: null,
  } as never);
describe("MCP transport integration", () => {
  it("keeps the legacy SSE channel open for asynchronous POST replies and paginates", async () => {
    expect((await client("sse").listTools()).map((tool) => tool.name)).toEqual([
      "alpha",
      "omega",
    ]);
    expect(await client("sse").callTool("echo", {})).toMatchObject({
      content: [{ text: "Fixture response" }],
      structuredContent: { verified: true },
    });
  });
  it("resolves streamed HTTP replies without waiting for the stream to close", async () => {
    expect(
      (await client("streamable_http").listTools()).map((tool) => tool.name),
    ).toEqual(["alpha", "omega"]);
    expect(await client("streamable_http").callTool("echo", {})).toMatchObject({
      structuredContent: { verified: true },
    });
  });
  it("propagates cancellation without retrying the tool action", async () => {
    const controller = new AbortController();
    const observed = new Promise<void>((resolve) => {
      observePending = resolve;
    });
    const pending = client("streamable_http").callTool(
      "pending",
      {},
      controller.signal,
    );
    const rejected = expect(pending).rejects.toThrow();
    await observed;
    controller.abort(new Error("User cancelled fixture"));
    await rejected;
    expect(
      calls.filter(
        (call) =>
          call.method === "tools/call" && call.params.name === "pending",
      ),
    ).toHaveLength(1);
  });
});
