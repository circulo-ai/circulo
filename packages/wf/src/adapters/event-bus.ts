import type {
  EventBus,
  EventCallback,
  Unsubscribe,
  WorkflowEvent,
} from "../models";

/**
 * Bridge contract for Redis Pub/Sub, NATS, Kafka, Ably, or another transport.
 * The adapter owns connection lifecycle; wf only defines topic semantics.
 */
export interface PubSubAdapter<TOutput> {
  publish(topic: string, event: WorkflowEvent<TOutput>): Promise<void>;
  subscribe(topic: string, callback: EventCallback<TOutput>): Unsubscribe;
}

/**
 * EventBus implementation backed by a caller-provided pub/sub transport.
 * Workflow-specific and global subscriptions use separate stable topics.
 */
export class AdapterEventBus<TOutput> implements EventBus<TOutput> {
  constructor(
    private readonly adapter: PubSubAdapter<TOutput>,
    private readonly topicPrefix = "wf:event:",
  ) {}

  async publish(event: WorkflowEvent<TOutput>): Promise<void> {
    await this.adapter.publish(this.workflowTopic(event.workflowId), event);
    await this.adapter.publish(this.globalTopic(), event);
  }

  subscribe(workflowId: string, callback: EventCallback<TOutput>): Unsubscribe {
    return this.adapter.subscribe(this.workflowTopic(workflowId), callback);
  }

  subscribeAll(callback: EventCallback<TOutput>): Unsubscribe {
    return this.adapter.subscribe(this.globalTopic(), callback);
  }

  private workflowTopic(workflowId: string): string {
    return `${this.topicPrefix}workflow:${workflowId}`;
  }

  private globalTopic(): string {
    return `${this.topicPrefix}all`;
  }
}

/** Reference pub/sub adapter for tests and single-process development. */
export class MapPubSubAdapter<TOutput> implements PubSubAdapter<TOutput> {
  private readonly subscribers = new Map<string, Set<EventCallback<TOutput>>>();

  async publish(topic: string, event: WorkflowEvent<TOutput>): Promise<void> {
    const callbacks = [...(this.subscribers.get(topic) ?? [])];
    await Promise.allSettled(
      callbacks.map((callback) => callback(structuredClone(event))),
    );
  }

  subscribe(topic: string, callback: EventCallback<TOutput>): Unsubscribe {
    const callbacks = this.subscribers.get(topic) ?? new Set();
    callbacks.add(callback);
    this.subscribers.set(topic, callbacks);
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.subscribers.delete(topic);
    };
  }
}
