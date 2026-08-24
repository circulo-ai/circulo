import type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventBus,
  WorkflowHistoryEventCallback,
} from "../models";

export class InMemoryWorkflowHistoryEventBus implements WorkflowHistoryEventBus {
  private readonly subscribers = new Map<
    string,
    Set<WorkflowHistoryEventCallback>
  >();

  async publish(event: WorkflowHistoryEvent): Promise<void> {
    const callbacks = this.subscribers.get(key(event.workflowId, event.runId));
    if (!callbacks) return;
    await Promise.allSettled(
      [...callbacks].map(async (callback) => callback(structuredClone(event))),
    );
  }

  subscribe(
    workflowId: string,
    runId: string,
    callback: WorkflowHistoryEventCallback,
  ): () => void {
    const subscriptionKey = key(workflowId, runId);
    const callbacks = this.subscribers.get(subscriptionKey) ?? new Set();
    callbacks.add(callback);
    this.subscribers.set(subscriptionKey, callbacks);
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.subscribers.delete(subscriptionKey);
    };
  }
}

function key(workflowId: string, runId: string): string {
  return `${workflowId}:${runId}`;
}
