# @circulo/core

A framework-agnostic domain + application toolbox inspired by clean architecture and DDD. It provides primitives for entities, value objects, domain events, errors, repositories, unit-of-work, and use-cases—without pulling in any runtime dependencies.

## What's Inside

- **Entities / Aggregate Roots**: Base classes with identity, timestamps, and domain-event accumulation.
- **Value Objects**: Immutable value wrapper base and a GUID-like `Identifier`.
- **Domain Events**: Event contracts and an in-memory publisher.
- **Errors**: `DomainError`, `ValidationError`, `NotFoundError`.
- **Contracts**: `Repository<T>`, `UnitOfWork<TScope>`, `UseCase<TRequest, TResponse>`.
- **Application Helpers**: `Result<T>` for success/failure and `Guard` utilities.

## Install

```bash
pnpm add @circulo/core
```

## Usage

### Entities & Value Objects

```ts
import { Entity, Identifier, ValidationError } from "@circulo/core";

type UserProps = { id: Identifier; name: string };

class User extends Entity<UserProps> {
  constructor(private props: UserProps) {
    super(props);
    if (!props.name.trim()) throw new ValidationError("Name required", "name");
  }
  get name() {
    return this.props.name;
  }
}

const user = new User({ id: Identifier.create(), name: "Ada" });
```

### Domain Events

```ts
import { DomainEventPublisher } from "@circulo/core";

const publisher = new DomainEventPublisher();
publisher.subscribe("UserRegistered", async (evt) => console.log(evt.payload));
await publisher.publish({
  name: "UserRegistered",
  occurredOn: new Date(),
  aggregateId: "123",
  payload: { email: "hi@example.com" },
});
```

### Use Cases

```ts
import { UseCase, Result } from "@circulo/core";

type Input = { email: string };
type Output = Result<void>;

class RegisterUser implements UseCase<Input, Output> {
  async execute(input: Input): Promise<Output> {
    if (!input.email.includes("@")) return Result.fail("Invalid email");
    // persist...
    return Result.ok();
  }
}
```

### Unit of Work Contract

```ts
import type { UnitOfWork } from "@circulo/core";

async function doStuff(uow: UnitOfWork) {
  return uow.transaction(async (scope) => {
    // use scope-bound repositories here
  });
}
```

## Design Notes

- No framework/runtime deps; pure TypeScript types and helpers.
- Serializable errors and events keep adapters thin.
- Entities do not depend on persistence or transport concerns.

## Developing

```bash
pnpm -C packages/core type-check
pnpm -C packages/core build
```
