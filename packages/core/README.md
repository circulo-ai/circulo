# @circulo-ai/core

Clean-architecture and DDD primitives for building framework-agnostic services. Ships only types and tiny helpers: entities, value objects, domain events, errors, repositories, unit-of-work, use cases, results, and guards without runtime dependencies.

## Features

- **Domain building blocks**: `Entity`, `AggregateRoot`, `ValueObject`, `Identifier`, domain errors.
- **Eventing**: Lightweight `DomainEvent` contract and in-memory `DomainEventPublisher`.
- **Application contracts**: `UseCase<TReq, TRes>`, `Result<T>` for explicit success/failure.
- **Boundaries**: `Repository<T>` and `UnitOfWork<TScope>` to keep persistence at the edges.
- **Utilities**: `Guard` helpers for simple argument checks.

## Install

```bash
bun add @circulo-ai/core
```

## Quick Start

```ts
import {
  AggregateRoot,
  DomainEventPublisher,
  Identifier,
  NotFoundError,
  Repository,
  Result,
  UnitOfWork,
  UseCase,
  ValidationError,
} from "@circulo-ai/core";

type AccountProps = { id: Identifier; balance: number };

class Account extends AggregateRoot<AccountProps> {
  constructor(private props: AccountProps) {
    super(props);
  }
  deposit(amount: number) {
    if (amount <= 0)
      throw new ValidationError("Amount must be positive", "amount");
    this.props = { ...this.props, balance: this.props.balance + amount };
    this.touch();
    this.addDomainEvent({
      name: "AccountCredited",
      occurredOn: new Date(),
      aggregateId: this.aggregateId.toString(),
      payload: { amount },
    });
  }
  get balance() {
    return this.props.balance;
  }
}

class CreditAccount implements UseCase<
  { id: string; amount: number },
  Result<void>
> {
  constructor(
    private readonly accounts: Repository<Account>,
    private readonly uow: UnitOfWork,
    private readonly publisher: DomainEventPublisher,
  ) {}
  async execute(input: { id: string; amount: number }) {
    return this.uow.transaction(async () => {
      const account = await this.accounts.getById(Identifier.from(input.id));
      if (!account) throw new NotFoundError("Account", input.id);
      account.deposit(input.amount);
      await this.accounts.save(account);
      await Promise.all(
        account.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );
      return Result.ok();
    });
  }
}
```

## Clean Architecture Fit

- Domain stays pure: no framework imports or IO concerns in entities/value objects.
- Application orchestrates: use cases coordinate transactions, repositories, and event dispatch.
- Infrastructure plugs in at the edges: implement `Repository`/`UnitOfWork` with your ORM, HTTP, or message adapters.
- Explicit errors and `Result` simplify transport mapping (HTTP codes, gRPC statuses, etc.).

## Documentation

- Full developer guide and patterns: [`packages/core/docs.md`](./docs.md)

## Developing

```bash
bun --cwd packages/core run type-check
bun --cwd packages/core run build
```
