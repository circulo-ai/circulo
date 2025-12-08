import type {
  EventBus,
  EventCallback,
  Unsubscribe,
  WorkflowEvent,
} from "../models";

export class InMemoryEventBus<TOutput> implements EventBus<TOutput> {
  private subscribers = new Map<string, Set<EventCallback<TOutput>>>();
  private globalSubscribers = new Set<EventCallback<TOutput>>();
  private eventQueue: Array<{
    event: WorkflowEvent<TOutput>;
    timestamp: number;
  }> = [];
  private processing = false;

  async publish(evt: WorkflowEvent<TOutput>): Promise<void> {
    this.eventQueue.push({ event: evt, timestamp: Date.now() });

    if (!this.processing) {
      this.processQueue().catch((err) => {
        console.error("Event processing error:", err);
      });
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    try {
      while (this.eventQueue.length > 0) {
        const item = this.eventQueue.shift();
        if (!item) break;

        const { event } = item;
        const callbacks = this.subscribers.get(event.workflowId);
        const allCallbacks = [
          ...(callbacks ? Array.from(callbacks) : []),
          ...Array.from(this.globalSubscribers),
        ];

        await Promise.allSettled(
          allCallbacks.map(async (cb) => {
            try {
              await cb(event);
            } catch (err) {
              console.error("Event callback error:", err);
            }
          }),
        );
      }
    } finally {
      this.processing = false;
    }
  }

  subscribe(workflowId: string, cb: EventCallback<TOutput>): Unsubscribe {
    if (!this.subscribers.has(workflowId)) {
      this.subscribers.set(workflowId, new Set());
    }
    this.subscribers.get(workflowId)!.add(cb);

    return () => {
      const callbacks = this.subscribers.get(workflowId);
      if (callbacks) {
        callbacks.delete(cb);
        if (callbacks.size === 0) {
          this.subscribers.delete(workflowId);
        }
      }
    };
  }

  subscribeAll(cb: EventCallback<TOutput>): Unsubscribe {
    this.globalSubscribers.add(cb);
    return () => {
      this.globalSubscribers.delete(cb);
    };
  }

  clear(): void {
    this.subscribers.clear();
    this.globalSubscribers.clear();
    this.eventQueue = [];
  }
}
