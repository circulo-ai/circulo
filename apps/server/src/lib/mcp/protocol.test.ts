import { describe, expect, it } from "vitest";
import { parseRpcResponse, parseSseEvents } from "./protocol";

describe("MCP protocol parsing", () => {
  it("parses event names and multiline data", () => {
    expect(
      parseSseEvents(
        ": keep-alive\n\n" +
          "event: message\n" +
          'data: {"jsonrpc":"2.0",\n' +
          'data: "result":{}}\n\n',
      ),
    ).toEqual([
      {
        event: "message",
        data: '{"jsonrpc":"2.0",\n"result":{}}',
      },
    ]);
  });

  it("parses JSON-RPC responses returned as SSE", () => {
    expect(
      parseRpcResponse(
        'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[]}}\n\n',
      ),
    ).toEqual({ jsonrpc: "2.0", result: { tools: [] } });
  });

  it("returns the JSON-RPC error when no result is present", () => {
    expect(
      parseRpcResponse(
        '{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid request"}}',
      ),
    ).toEqual({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid request" },
    });
  });
});
