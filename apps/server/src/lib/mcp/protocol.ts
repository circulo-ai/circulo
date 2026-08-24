export type JsonRpcResponse = {
  result?: {
    tools?: Array<{
      name: string;
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean };
      readOnlyHint?: boolean;
    }>;
    content?: unknown[];
    isError?: boolean;
  };
  error?: { code?: number; message?: string; data?: unknown };
};

export type SseEvent = { event?: string; data: string };

/** Parse all complete Server-Sent Events in a response body. */
export function parseSseEvents(body: string): SseEvent[] {
  return body.split(/\r?\n\r?\n/).flatMap((block) => {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    return data.length > 0 ? [{ event, data: data.join("\n") }] : [];
  });
}

/** Parse JSON-RPC responses returned as JSON or an SSE data stream. */
export function parseRpcResponse(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (!trimmed) return {};

  const candidates = trimmed.startsWith("{")
    ? [trimmed]
    : parseSseEvents(trimmed).map((event) => event.data);

  for (const candidate of candidates.reverse()) {
    if (!candidate || candidate === "[DONE]") continue;
    try {
      const payload = JSON.parse(candidate) as JsonRpcResponse;
      if (payload.result || payload.error) return payload;
    } catch {
      // Ignore non-JSON SSE frames and continue looking for the RPC response.
    }
  }

  throw new Error("MCP returned no JSON-RPC response");
}
