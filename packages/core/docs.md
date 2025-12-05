# @circulo-ai/core Developer Guide

Framework-agnostic primitives to keep your domain and application layers clean. Everything here is designed to support hexagonal / clean architecture: the domain is pure, the application orchestrates use cases, and infrastructure is kept at the edges behind interfaces.

## Installation

```bash
pnpm add @circulo-ai/core
```

## Layer Mapping

- **Domain**: `Entity`, `AggregateRoot`, `ValueObject`, `Identifier`, domain errors, domain events.
- **Application**: `UseCase<TReq, TRes>`, `Result<T>`.
- **Boundaries**: `Repository<T>`, `UnitOfWork<TScope>`.
- **Cross-cutting utilities**: `Guard`, `DomainEventPublisher`.

Keep domain types free from framework and transport concerns. Let the application layer compose domain logic with repositories, unit-of-work implementations, and event publishers supplied by your infrastructure layer.

## Domain Primitives

### Entities and Value Objects

Use `Identifier` for entity identity and `ValueObject` for immutable value types. Entities come with `createdAt`, `updatedAt`, equality on id, and a protected `touch()` helper to update timestamps.

```ts
import {
  Entity,
  Identifier,
  ValueObject,
  ValidationError,
} from "@circulo-ai/core";

class Email extends ValueObject<{ value: string }> {
  get value() {
    return this.props.value;
  }
  static create(raw: string) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized.includes("@"))
      throw new ValidationError("Email invalid", "email");
    return new Email({ value: normalized });
  }
}

type UserProps = { id: Identifier; email: Email; displayName: string };

class User extends Entity<UserProps> {
  constructor(private props: UserProps) {
    super(props);
    if (!props.displayName.trim())
      throw new ValidationError("Display name required", "displayName");
  }
  get email() {
    return this.props.email;
  }
  rename(newName: string) {
    if (!newName.trim())
      throw new ValidationError("Display name required", "displayName");
    this.props = { ...this.props, displayName: newName }; // immutable pattern inside the aggregate
    this.touch();
  }
}

const user = new User({
  id: Identifier.create(),
  email: Email.create("hi@example.com"),
  displayName: "Ada",
});
```

### Aggregate Roots and Domain Events

`AggregateRoot` extends `Entity` and lets you accumulate domain events with `addDomainEvent` and later drain them via `pullDomainEvents()`. `DomainEvent` is a lightweight contract (`name`, `occurredOn`, `aggregateId`, optional `payload` and `metadata`). Use `DomainEventPublisher` to dispatch events to in-memory subscribers; adapt it to your message bus if needed.

```ts
import {
  AggregateRoot,
  DomainEventPublisher,
  Identifier,
} from "@circulo-ai/core";

type ChatProps = { id: Identifier; title: string };

class Chat extends AggregateRoot<ChatProps> {
  constructor(private props: ChatProps) {
    super(props);
  }
  rename(title: string) {
    this.props = { ...this.props, title };
    this.touch();
    this.addDomainEvent({
      name: "ChatRenamed",
      occurredOn: new Date(),
      aggregateId: this.aggregateId.toString(),
      payload: { title },
    });
  }
  get title() {
    return this.props.title;
  }
}

const publisher = new DomainEventPublisher();
publisher.subscribe("ChatRenamed", async (evt) => {
  // fan-out to other bounded contexts, audit logs, etc.
});

const chat = new Chat({ id: Identifier.create(), title: "General" });
chat.rename("Announcements");
await Promise.all(chat.pullDomainEvents().map((evt) => publisher.publish(evt)));
```

### Domain Errors

`DomainError` is the base class. `ValidationError` is for invariant violations (useful in value objects and aggregates). `NotFoundError` communicates missing entities. Throw domain errors inside the domain; translate them at the application/transport edge (HTTP 400/404, gRPC status codes, etc.).

## Application Layer

### Use Cases

`UseCase<TRequest, TResponse>` is a simple contract for application services. Keep orchestration, transaction handling, and integration in use cases; leave invariants to the domain model.

### Result Helper

`Result<T>` wraps success/failure without relying on exceptions for expected failures. It carries either a value or an error string and can be combined across multiple checks.

```ts
import {
  UseCase,
  Result,
  Guard,
  Identifier,
  NotFoundError,
  DomainEventPublisher,
  type Repository,
  type UnitOfWork,
} from "@circulo-ai/core";

type RenameChatInput = { id: string; title: string };
type RenameChatOutput = Result<void>;

class RenameChat implements UseCase<RenameChatInput, RenameChatOutput> {
  constructor(
    private readonly chats: Repository<Chat>,
    private readonly uow: UnitOfWork,
    private readonly publisher: DomainEventPublisher
  ) {}

  async execute(input: RenameChatInput): Promise<RenameChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    const titleCheck = Guard.againstEmptyString(input.title, "title");
    if (!titleCheck.succeeded) return Result.fail(titleCheck.message);

    return this.uow.transaction(async () => {
      const chat = await this.chats.getById(Identifier.from(input.id));
      if (!chat) throw new NotFoundError("Chat", input.id);

      chat.rename(input.title);
      await this.chats.save(chat);

      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt))
      );
      return Result.ok();
    });
  }
}
```

## Boundaries for Infrastructure

### Repository

`Repository<T>` is intentionally minimal: `getById`, `save`, and `deleteById`. Your infrastructure layer adapts this to ORMs, HTTP data sources, or files. Prefer returning domain models, not persistence DTOs. Keep mapping logic in mappers/assemblers close to the repository implementation.

### Unit of Work

`UnitOfWork<TScope>` wraps transactional work. The `TScope` can carry ORM transactions or connection handles. Typical pattern:

```ts
import type { UnitOfWork } from "@circulo-ai/core";

class PrismaUnitOfWork implements UnitOfWork<Prisma.TransactionClient> {
  constructor(private readonly prisma: PrismaClient) {}

  async transaction<TResult>(
    work: (scope: Prisma.TransactionClient) => Promise<TResult>
  ) {
    return this.prisma.$transaction(async (tx) => work(tx));
  }
  async commit() {
    /* noop for prisma $transaction */
  }
  async rollback() {
    /* rely on $transaction rollback */
  }
}
```

Repositories can be scope-aware (receive `tx` from the unit of work) or acquire connections internally depending on your adapter.

## Guard Helpers

`Guard` offers small, composable validations: null/undefined, empty strings, UUID format. Pair it with `Result` when you want early exits without throwing.

## Suggested Project Layout

- `domain/` - aggregates, entities, value objects, domain services, domain events.
- `application/` - use cases, DTOs, orchestrations, handlers.
- `infrastructure/` - repository implementations, unit-of-work, mappers, external gateways.
- `interfaces/` - HTTP/GraphQL/CLI controllers translating transport to use case inputs.

Keep dependencies flowing inward: infrastructure depends on domain/application interfaces, never the other way around.

## Testing Guidelines

- Unit test aggregates and value objects without touching IO.
- Application tests can mock repositories/unit-of-work/event publisher; assert emitted events via `pullDomainEvents`.
- Integration tests live in infrastructure and prove repository/unit-of-work correctness against real data sources.

## Production Tips

- Translate `DomainError`/`ValidationError`/`NotFoundError` to transport-specific responses at the edge.
- Publish domain events after persistence succeeds; drain `pullDomainEvents()` inside the same transaction boundary when possible.
- Avoid exposing internal persistence shapes to the domain; use mappers to convert to domain types at the boundary.

## Reference

Exports are gathered in `@circulo-ai/core` root entrypoint:

```ts
// Domain
Entity,
  AggregateRoot,
  Identifier,
  ValueObject,
  DomainError,
  ValidationError,
  NotFoundError,
  DomainEvent,
  DomainEventPublisher,
  Repository,
  UnitOfWork,
  // Application
  UseCase,
  Result,
  // Utilities
  Guard;
```
