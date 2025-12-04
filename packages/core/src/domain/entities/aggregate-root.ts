import { Identifier } from "../value-objects/identifier";
import type { DomainEvent } from "../events/domain-event";
import { Entity, type EntityProps } from "./base-entity";

export abstract class AggregateRoot<
  TProps extends EntityProps = EntityProps,
> extends Entity<TProps> {
  private readonly domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  get aggregateId(): Identifier {
    return this.id;
  }
}
