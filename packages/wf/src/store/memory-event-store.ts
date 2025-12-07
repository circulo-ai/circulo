import type { WorkflowEvent, EventStore } from "../models";

export class InMemoryEventStore<TOutput> implements EventStore<TOutput> {
  private events: WorkflowEvent<TOutput>[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 100000) {
    this.maxEvents = maxEvents;
  }

  async append(event: WorkflowEvent<TOutput>): Promise<void> {
    this.events.push(structuredClone(event));
    this.pruneIfNeeded();
  }

  async appendBatch(events: WorkflowEvent<TOutput>[]): Promise<void> {
    this.events.push(...events.map((e) => structuredClone(e)));
    this.pruneIfNeeded();
  }

  async list(
    workflowId: string,
    fromTimestamp?: number
  ): Promise<WorkflowEvent<TOutput>[]> {
    return this.events
      .filter((e) => {
        if (e.workflowId !== workflowId) return false;
        if (fromTimestamp !== undefined && e.timestamp < fromTimestamp)
          return false;
        return true;
      })
      .map((e) => structuredClone(e));
  }

  async count(workflowId: string): Promise<number> {
    return this.events.filter((e) => e.workflowId === workflowId).length;
  }

  async clear(workflowId: string): Promise<void> {
    this.events = this.events.filter((e) => e.workflowId !== workflowId);
  }

  clearAll(): void {
    this.events = [];
  }

  private pruneIfNeeded(): void {
    if (this.events.length > this.maxEvents) {
      const excess = this.events.length - this.maxEvents;
      this.events.splice(0, excess);
    }
  }
}
