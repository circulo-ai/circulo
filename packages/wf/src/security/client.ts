import type {
  WorkflowControlAction,
  WorkflowEvent,
  WorkflowQueryView,
  WorkflowRemoteClient,
  WorkflowStreamOptions,
} from "../models";

export type WorkflowAccessTokenProvider =
  | string
  | (() => string | Promise<string>);

export interface WorkflowBackendAdapter {
  queryWorkflow(
    workflowId: string,
    token: string,
    options?: { tenantId?: string | undefined },
  ): Promise<WorkflowQueryView>;
  streamWorkflowEvents(
    workflowId: string,
    token: string,
    options?: WorkflowStreamOptions,
  ): AsyncIterable<WorkflowEvent<unknown>>;
  controlWorkflow?(
    workflowId: string,
    action: WorkflowControlAction,
    token: string,
    payload?: { reason?: string | undefined; tenantId?: string | undefined },
  ): Promise<void>;
}

/** Binds a short-lived access token to a backend adapter without exposing it to components. */
export class SecureWorkflowClient implements WorkflowRemoteClient {
  constructor(
    private readonly adapter: WorkflowBackendAdapter,
    private readonly accessToken: WorkflowAccessTokenProvider,
  ) {}

  async queryWorkflow(
    workflowId: string,
    options?: { tenantId?: string | undefined },
  ): Promise<WorkflowQueryView> {
    return this.adapter.queryWorkflow(
      workflowId,
      await resolveToken(this.accessToken),
      options,
    );
  }

  async *streamWorkflowEvents(
    workflowId: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    const token = await resolveToken(this.accessToken);
    yield* this.adapter.streamWorkflowEvents(workflowId, token, options);
  }

  async controlWorkflow(
    workflowId: string,
    action: WorkflowControlAction,
    payload?: { reason?: string | undefined; tenantId?: string | undefined },
  ): Promise<void> {
    if (!this.adapter.controlWorkflow) {
      throw new Error(
        "The configured workflow adapter does not support control operations",
      );
    }
    await this.adapter.controlWorkflow(
      workflowId,
      action,
      await resolveToken(this.accessToken),
      payload,
    );
  }
}

export interface WorkflowHttpAdapterOptions {
  baseUrl: string;
  fetch?: WorkflowFetch;
  headers?: Record<string, string>;
  /** Timeout for query and control requests. Streaming is intentionally open-ended. */
  requestTimeoutMs?: number | undefined;
}

export interface WorkflowFetchRequest {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  body?: string;
}

export interface WorkflowFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: WorkflowReadableBody | undefined;
  json(): Promise<unknown>;
}

export type WorkflowFetch = (
  input: string,
  init?: WorkflowFetchRequest,
) => Promise<WorkflowFetchResponse>;

export interface WorkflowReadableBody {
  getReader(): WorkflowReadableBodyReader;
}

export interface WorkflowReadableBodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
  releaseLock?(): void;
}

/** Standard bearer-token HTTP adapter. The stream endpoint uses newline-delimited SSE data frames. */
export class WorkflowHttpAdapter implements WorkflowBackendAdapter {
  private readonly fetcher: WorkflowFetch;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestTimeoutMs: number;

  constructor(options: WorkflowHttpAdapterOptions) {
    if (!options.baseUrl.trim()) {
      throw new Error("Workflow HTTP adapter baseUrl must not be empty");
    }
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.fetcher = options.fetch ?? defaultFetch;
    this.headers = { ...options.headers };
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new RangeError("Workflow HTTP requestTimeoutMs must be positive");
    }
  }

  async queryWorkflow(
    workflowId: string,
    token: string,
    options: { tenantId?: string | undefined } = {},
  ): Promise<WorkflowQueryView> {
    const url = this.url(
      `/workflows/${encodeURIComponent(workflowId)}`,
      options.tenantId,
    );
    const response = await this.fetchWithTimeout(url, {
      headers: this.authHeaders(token),
    });
    await assertOk(response);
    return (await response.json()) as WorkflowQueryView;
  }

  async *streamWorkflowEvents(
    workflowId: string,
    token: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    const url = this.url(
      `/workflows/${encodeURIComponent(workflowId)}/events`,
      options.tenantId,
    );
    const request: WorkflowFetchRequest = {
      headers: { ...this.authHeaders(token), Accept: "text/event-stream" },
    };
    if (options.signal) request.signal = options.signal;
    const response = await this.fetcher(url, request);
    await assertOk(response);
    if (!response.body)
      throw new Error("Workflow event stream response has no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
          stream: !chunk.done,
        });
        const frames = buffer.split(/\r?\n\r?\n/u);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) yield JSON.parse(data) as WorkflowEvent<unknown>;
        }
        if (chunk.done) break;
      }
      if (buffer.trim()) {
        const data = buffer
          .split(/\r?\n/u)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield JSON.parse(data) as WorkflowEvent<unknown>;
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  async controlWorkflow(
    workflowId: string,
    action: WorkflowControlAction,
    token: string,
    payload: {
      reason?: string | undefined;
      tenantId?: string | undefined;
    } = {},
  ): Promise<void> {
    const body = JSON.stringify(
      payload.tenantId === undefined ? { reason: payload.reason } : payload,
    );
    const response = await this.fetchWithTimeout(
      this.url(
        `/workflows/${encodeURIComponent(workflowId)}/actions/${action}`,
      ),
      {
        method: "POST",
        headers: {
          ...this.authHeaders(token),
          "Content-Type": "application/json",
        },
        body,
      },
    );
    await assertOk(response);
  }

  private authHeaders(token: string): Record<string, string> {
    return { ...this.headers, Authorization: `Bearer ${token}` };
  }

  private async fetchWithTimeout(
    input: string,
    init: WorkflowFetchRequest,
  ): Promise<WorkflowFetchResponse> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      if (init.signal?.aborted) controller.abort();
      const request = this.fetcher(input, {
        ...init,
        signal: controller.signal,
      });
      const timeoutError = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          abort();
          reject(
            new Error(
              `Workflow backend request timed out after ${this.requestTimeoutMs}ms`,
            ),
          );
        }, this.requestTimeoutMs);
      });
      return await Promise.race([request, timeoutError]);
    } catch (error) {
      if (timedOut) {
        throw new Error(
          `Workflow backend request timed out after ${this.requestTimeoutMs}ms`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abort);
    }
  }

  private url(path: string, tenantId?: string): string {
    if (!tenantId) return `${this.baseUrl}${path}`;
    return `${this.baseUrl}${path}?tenantId=${encodeURIComponent(tenantId)}`;
  }
}

async function resolveToken(
  provider: WorkflowAccessTokenProvider,
): Promise<string> {
  const token = typeof provider === "function" ? await provider() : provider;
  if (!token.trim()) throw new Error("Workflow access token is empty");
  return token.trim();
}

async function assertOk(response: WorkflowFetchResponse): Promise<void> {
  if (response.ok) return;
  throw new Error(
    `Workflow backend request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`,
  );
}

const defaultFetch: WorkflowFetch = (input, init) =>
  fetch(
    input,
    init as RequestInit,
  ) as unknown as Promise<WorkflowFetchResponse>;
