import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  deleteRequest,
  getRequest,
  postRequest,
} from "./client";

function mockFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("returns the parsed body for a successful JSON response", async () => {
    mockFetch(jsonResponse({ id: "chat-1" }));

    await expect(
      getRequest<{ id: string }>("/api/chats/chat-1"),
    ).resolves.toEqual({ id: "chat-1" });
  });

  it("resolves undefined for 204 No Content without parsing a body", async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(deleteRequest("/api/chats/chat-1")).resolves.toBeUndefined();
  });

  it("returns null when a successful response is not JSON", async () => {
    mockFetch(
      new Response("plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(getRequest("/api/health")).resolves.toBeNull();
  });

  it("maps HTTP status codes to stable string codes", async () => {
    const cases: [number, string][] = [
      [400, "BAD_REQUEST"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [405, "METHOD_NOT_ALLOWED"],
      [409, "CONFLICT"],
      [429, "RATE_LIMIT"],
      [500, "INTERNAL_SERVER_ERROR"],
      [418, "API_ERROR"],
    ];

    for (const [status, code] of cases) {
      mockFetch(jsonResponse({ message: "nope" }, { status }));

      const error = await getRequest("/api/chats").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ status, code, message: "nope" });
    }
  });

  it("carries the backend validation errors array through as details", async () => {
    mockFetch(
      jsonResponse(
        { message: "Invalid", errors: [{ path: "title" }] },
        { status: 400 },
      ),
    );

    const error = (await postRequest("/api/chats", { title: "" }).catch(
      (e: unknown) => e,
    )) as ApiRequestError;

    expect(error.details).toEqual([{ path: "title" }]);
  });

  it("falls back to the status text when the error body has no message", async () => {
    mockFetch(new Response(null, { status: 503, statusText: "Unavailable" }));

    await expect(getRequest("/api/chats")).rejects.toMatchObject({
      status: 503,
      message: "Unavailable",
    });
  });

  it("reports a transport failure as a NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(getRequest("/api/chats")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });

  it("serializes a plain object body and sets the JSON content type", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));

    await postRequest("/api/chats", { title: "Hello" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.body).toBe('{"title":"Hello"}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("passes a FormData body through untouched and sets no content type", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    const form = new FormData();
    form.set("file", "contents");

    await postRequest("/api/files", form);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("does not override a content type the caller already set", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));

    await postRequest("/api/chats", "raw", {
      headers: { "content-type": "text/plain" },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.headers).toEqual({ "content-type": "text/plain" });
  });

  it("omits the body entirely when none is given", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));

    await getRequest("/api/chats");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.body).toBeUndefined();
  });
});
