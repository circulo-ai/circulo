import type { CustomUIMessageChunk } from "@/lib/types";

type Listener = () => void;

/**
 * Replayable per-run output channel used by the HTTP stream and reconnect
 * endpoint. The workflow engine owns execution; this channel only transports
 * AI SDK UI message chunks to clients.
 */
export class WorkflowOutputChannel {
  private readonly chunks: CustomUIMessageChunk[] = [];
  private readonly listeners = new Set<Listener>();
  private closed = false;
  private textMessageStarted = false;

  write(chunk: CustomUIMessageChunk): void {
    if (this.closed) return;
    if (chunk.type === "text-start") this.textMessageStarted = true;
    this.chunks.push(chunk);
    this.notify();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.notify();
  }

  get size(): number {
    return this.chunks.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get hasTextMessage(): boolean {
    return this.textMessageStarted;
  }

  createReadable(startIndex = 0): ReadableStream<CustomUIMessageChunk> {
    if (!Number.isInteger(startIndex) || startIndex < 0) {
      throw new RangeError("startIndex must be a non-negative integer");
    }

    let index = startIndex;
    let controller: ReadableStreamDefaultController<CustomUIMessageChunk>;
    let listener: Listener | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let settled = false;

    const cleanup = () => {
      if (listener) this.listeners.delete(listener);
      listener = undefined;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    };

    const pump = () => {
      if (settled) return;

      while (index < this.chunks.length) {
        controller.enqueue(this.chunks[index]!);
        index += 1;
      }

      if (this.closed && index >= this.chunks.length) {
        settled = true;
        cleanup();
        controller.close();
      }
    };

    return new ReadableStream<CustomUIMessageChunk>({
      start: (streamController) => {
        controller = streamController;
        listener = pump;
        this.listeners.add(listener);
        pump();

        // Keep long-running model/tool calls alive through Bun, proxies, and
        // load balancers without polluting the replay buffer. AI SDK accepts
        // custom data chunks and the client intentionally ignores this one.
        heartbeatTimer = setInterval(() => {
          if (settled || this.closed) return;
          try {
            controller.enqueue({
              type: "data-workflowHeartbeat",
              data: { timestamp: new Date().toISOString() },
            });
          } catch {
            settled = true;
            cleanup();
          }
        }, 5_000);
      },
      cancel: () => {
        settled = true;
        cleanup();
      },
    });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

const channels = new Map<string, WorkflowOutputChannel>();

export function createWorkflowOutputChannel(
  workflowId: string,
): WorkflowOutputChannel {
  const existing = channels.get(workflowId);
  if (existing && !existing.isClosed) return existing;

  const channel = new WorkflowOutputChannel();
  channels.set(workflowId, channel);
  return channel;
}

export function getWorkflowOutputChannel(
  workflowId: string,
): WorkflowOutputChannel | undefined {
  return channels.get(workflowId);
}

export function publishWorkflowChunk(
  workflowId: string,
  chunk: CustomUIMessageChunk,
): void {
  channels.get(workflowId)?.write(chunk);
}

export function closeWorkflowOutputChannel(workflowId: string): void {
  const channel = channels.get(workflowId);
  if (!channel) return;

  channel.close();
  // Completed channels are replayed from the durable event store on demand.
  // Remove the in-memory instance so long-lived server processes do not retain
  // every completed workflow and its full chunk buffer indefinitely.
  // Defer removal by one microtask so the request that just completed can still
  // obtain the closed channel and return its terminal stream to the caller.
  queueMicrotask(() => {
    if (channels.get(workflowId) === channel) channels.delete(workflowId);
  });
}
