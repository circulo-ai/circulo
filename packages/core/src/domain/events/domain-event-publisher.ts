import type { DomainEvent } from "./domain-event";

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

export class DomainEventPublisher {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent["name"],
    handler: DomainEventHandler<TEvent>,
  ): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler as DomainEventHandler);
    this.handlers.set(eventName, handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.name);
    if (!handlers?.length) return;
    await Promise.all(handlers.map(async (handler) => handler(event)));
  }
}
