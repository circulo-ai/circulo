import type { IdentifierValue } from "../value-objects/identifier";

export interface DomainEvent<TPayload = unknown> {
  name: string;
  occurredOn: Date;
  aggregateId: IdentifierValue;
  payload?: TPayload;
  metadata?: Record<string, unknown>;
}
