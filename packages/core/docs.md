# Core Package Guide

## Modules

- `domain/entities`: `Entity`, `AggregateRoot` with `createdAt`, `updatedAt`, and equality on `Identifier`.
- `domain/value-objects`: `Identifier` (UUID-like) and `ValueObject` base.
- `domain/events`: `DomainEvent` contract and `DomainEventPublisher`.
- `domain/errors`: `DomainError`, `ValidationError`, `NotFoundError`.
- `domain/repositories`: `Repository<T>` and `UnitOfWork<TScope>` interfaces.
- `application`: `UseCase<TInput,TOutput>` and `Result<T>` helper.
- `utils/guard`: null/undefined, empty string, UUID checks.

## Patterns

- **Entities vs Value Objects**: Entities carry identity (`Identifier`); value objects are immutable and compared by value.
- **AggregateRoot**: Collect domain events via `addDomainEvent` and expose them with `pullDomainEvents`.
- **Unit of Work**: Adapter-specific implementation coordinates transactions and repository instances.
- **Result**: Provide explicit success/failure without throwing for expected errors.

## Example: Aggregate with Events

```ts
import {
  AggregateRoot,
  Identifier,
  DomainEventPublisher,
  DomainEvent,
} from "@circulo/core";

type ChatProps = { id: Identifier; title: string };

class Chat extends AggregateRoot<ChatProps> {
  private title: string;
  constructor(props: ChatProps) {
    super(props);
    this.title = props.title;
  }
  rename(title: string) {
    this.title = title;
    this.touch();
    this.addDomainEvent({
      name: "ChatRenamed",
      occurredOn: new Date(),
      aggregateId: this.aggregateId.toString(),
      payload: { title },
    });
  }
}

const publisher = new DomainEventPublisher();
const chat = new Chat({ id: Identifier.create(), title: "Hello" });
chat.rename("New Title");
await Promise.all(chat.pullDomainEvents().map((evt) => publisher.publish(evt)));
```

## Example: Guard + Result

```ts
import { Guard, Result } from "@circulo/core";

function createEmail(value: string) {
  const guard = Guard.againstEmptyString(value, "email");
  if (!guard.succeeded) return Result.fail(guard.message);
  if (!value.includes("@")) return Result.fail("Email must contain @");
  return Result.ok(value.toLowerCase());
}
```

## Testing

- Keep aggregates pure; unit test invariants without touching IO.
- Mock `UnitOfWork` and repositories in application service tests.
- Event publisher can be injected/mocked to assert emissions.
