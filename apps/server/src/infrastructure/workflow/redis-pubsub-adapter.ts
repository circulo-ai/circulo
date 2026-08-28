import type { CirculoRedis } from "@circulo-ai/redis";
import type { EventCallback, PubSubAdapter, WorkflowEvent } from "@circulo-ai/wf";
import type Redis from "ioredis";

type TopicCallback<TOutput> = EventCallback<TOutput>;

/**
 * Redis transport for wf's AdapterEventBus.
 *
 * The adapter keeps a dedicated subscriber connection, dispatches locally
 * after a successful publish (so a just-created subscription cannot miss the
 * first event), and de-duplicates the Redis loopback delivery of that event.
 */
export class RedisWorkflowPubSubAdapter<TOutput>
  implements PubSubAdapter<TOutput>
{
  private readonly subscriber: Redis;
  private readonly callbacks = new Map<string, Set<TopicCallback<TOutput>>>();
  private readonly locallyPublished = new Set<string>();
  private closed = false;

  constructor(
    private readonly redis: CirculoRedis,
    private readonly logger: {
      warn(message: string, context?: Record<string, unknown>): void;
      error(message: string, error?: Error, context?: Record<string, unknown>): void;
    },
  ) {
    this.subscriber = redis.raw.duplicate();
    this.subscriber.on("error", (error) => {
      this.logger.error("Workflow Redis subscriber error", error);
    });
    this.subscriber.on("message", (topic, payload) => {
      void this.dispatchRemote(topic, payload);
    });
  }

  async publish(topic: string, event: WorkflowEvent<TOutput>): Promise<void> {
    if (this.closed) throw new Error("Workflow Redis pub/sub is closed");

    const payload = JSON.stringify(event);
    const dedupeKey = `${topic}:${event.id}`;
    this.locallyPublished.add(dedupeKey);
    try {
      await this.redis.raw.publish(topic, payload);
      await this.dispatch(topic, event);
    } catch (error) {
      this.locallyPublished.delete(dedupeKey);
      throw error;
    }

    // Keep the set bounded even when a subscriber is not connected long
    // enough to receive its own loopback message.
    setTimeout(() => this.locallyPublished.delete(dedupeKey), 60_000).unref?.();
  }

  subscribe(topic: string, callback: TopicCallback<TOutput>): () => void {
    if (this.closed) throw new Error("Workflow Redis pub/sub is closed");
    const callbacks = this.callbacks.get(topic) ?? new Set();
    callbacks.add(callback);
    this.callbacks.set(topic, callbacks);
    if (callbacks.size === 1) {
      void this.subscriber.subscribe(topic).catch((error: unknown) => {
        this.logger.error("Workflow Redis subscription failed", toError(error), {
          topic,
        });
      });
    }

    return () => {
      const current = this.callbacks.get(topic);
      if (!current) return;
      current.delete(callback);
      if (current.size > 0) return;
      this.callbacks.delete(topic);
      void this.subscriber.unsubscribe(topic).catch((error: unknown) => {
        this.logger.warn("Workflow Redis unsubscribe failed", {
          topic,
          error: toError(error).message,
        });
      });
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.callbacks.clear();
    this.locallyPublished.clear();
    try {
      await this.subscriber.quit();
    } catch {
      this.subscriber.disconnect();
    }
  }

  private async dispatchRemote(topic: string, payload: string): Promise<void> {
    let event: WorkflowEvent<TOutput>;
    try {
      event = JSON.parse(payload) as WorkflowEvent<TOutput>;
    } catch (error) {
      this.logger.warn("Ignoring malformed workflow Redis event", {
        topic,
        error: toError(error).message,
      });
      return;
    }

    const dedupeKey = `${topic}:${event.id}`;
    if (this.locallyPublished.delete(dedupeKey)) return;
    await this.dispatch(topic, event);
  }

  private async dispatch(
    topic: string,
    event: WorkflowEvent<TOutput>,
  ): Promise<void> {
    const callbacks = [...(this.callbacks.get(topic) ?? [])];
    await Promise.allSettled(
      callbacks.map((callback) => callback(structuredClone(event))),
    );
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
