# Clean Architecture Migration Plan (Server App)

Goal: refactor `apps/server` to align with @circulo/core DDD/clean architecture while integrating Drizzle and existing DI.

## Milestones

1. **Assess & isolate**: inventory current routes, services, db access, and cross-cutting concerns; decide target boundaries (domain, application, infrastructure, interfaces).
2. **Domain modeling**: define aggregates/value objects/events under `apps/server/src/domain` for core concepts (Chat, Message, User, Organization, Permissions, RateLimit).
3. **Infrastructure adapters**: implement Drizzle repositories + mappers per aggregate and ensure they accept UoW-scoped clients; keep schema in `packages/db`.
4. **Unit of work & eventing**: finalize `DrizzleUnitOfWork` interface to match `UnitOfWork` contract; introduce `DomainEventPublisher` binding and event handlers (e.g., dispatch to Inngest/queues).
5. **Application layer**: add use cases for main flows (Chat CRUD, Messaging, Auth/Session, Permissions checks, Files) using `Result`/`Guard` and domain errors.
6. **Interfaces (HTTP/Workflows)**: refactor Hono routes/workflows to call use cases, translate domain/application outcomes to HTTP; move imperative logic out of routes.
7. **Cross-cutting**: centralize logging, validation, auth/permissions policies, rate limiting as edge adapters or decorators; ensure idempotent/transactional boundaries.
8. **Testing & verification**: add unit tests for domain/application, integration for repos/UoW, and smoke E2E for critical routes.

## Tracking

- [x] Milestone 1: Assessment notes captured
- [x] Milestone 2: Domain layer scaffolded
- [x] Milestone 3: Repos/mappers implemented
- [x] Milestone 4: UoW/eventing finalized
- [x] Milestone 5: Use cases in place
- [ ] Milestone 6: Routes/workflows refactored
- [ ] Milestone 7: Cross-cutting consolidated
- [ ] Milestone 8: Tests added/passing

## Milestone 1 Notes (Assessment)

- Current boundaries: Hono routes in `apps/server/src/routes` call Drizzle repos directly from `packages/db/repositories` (e.g., `chatRepo`, `messageRepo`, `agentRepo`, `voteRepo`, `suggestionRepo`); application/domain layers are absent. DI (`apps/server/src/di/container.ts`) wires raw repos + `DrizzleUnitOfWork` but repos ignore UoW scope and expose static helpers.
- Data layer: Drizzle schema in `packages/db/schema` (chat, message, chat-member/invitation, agent, chat-agent, artifact, suggestion, vote, auth); repositories are persistence-centric and return plain objects, often mixing pagination, search, and permission filters.
- Cross-cutting: auth/permissions in `apps/server/src/lib/auth` + `lib/permissions`; rate limiting using Redis/Postgres stores (`apps/server/src/services/rate-limit`); uploads/storage abstractions under `lib/uploads`; logging via `lib/logs`; AI/orchestration in `lib/ai` and `workflows/orchestrate`; background events with Inngest.
- UoW: `DrizzleUnitOfWork` supports manual/tx scope but existing repos/routes don’t consume the scoped client—transactions are not enforced at use case boundaries.
- Eventing: No domain events; `DomainEventPublisher` unused. Inngest workflows triggered ad hoc from routes.
- Validation/error handling: Mixed use of zod validators in routes and ad hoc guards; domain errors mostly transport-specific (`HttpError`), not domain/application-level.
- Testing: Limited; no domain/application tests. Integration tests not visible for repos; only some auth tests present.

## Milestone 2 Notes (Domain layer scaffolded)

- Added domain aggregates/entities/value objects in `apps/server/src/domain` using @circulo/core primitives:
  - Chat aggregate with rename/visibility changes and domain events (`chat/chat.ts`, `chat/events.ts`).
  - Message entity with edit capability (`message/message.ts`).
  - User aggregate with org membership updates (`user/user.ts`).
  - Organization aggregate (`organization/organization.ts`).
  - Permission value object (`permissions/permission.ts`).
  - RateLimitPolicy value object (`rate-limit/rate-limit-policy.ts`).
  - Agent aggregate (`agent/agent.ts`).
  - Chat membership/linking: `chat-member.ts`, `chat-invitation.ts`, `chat-agent-link.ts`.
  - Artifact aggregate (`artifact/artifact.ts`).
  - Suggestion entity (`suggestion/suggestion.ts`).
  - Vote value object (`vote/vote.ts`).
- Barrel export at `apps/server/src/domain/index.ts` to keep imports clean for application/infrastructure layers.
- Validation now uses `ValidationError` and keeps invariants inside domain types; events defined for chat rename/visibility to hook into publisher later.

## Milestone 3 Notes (Infrastructure adapters)

- Added Drizzle-based repositories that accept UoW-scoped `DbInstance` and map rows to domain models:
  - Chat, Message, Agent, ChatMember, ChatInvitation, ChatAgentLink, Artifact, Suggestion, User, Organization.
- Repositories live under `apps/server/src/infrastructure/drizzle` with per-aggregate mappers and a barrel export for DI wiring.
- All repos implement `Repository<T>` from @circulo/core and perform upsert-style persistence while preserving domain types (`Identifier`, value objects).

## Milestone 4 Notes (UoW/eventing)

- DI now wires `DrizzleUnitOfWork` per request scope and instantiates Drizzle repositories with the scoped client, ensuring transaction boundaries flow through repos.
- Introduced `DomainEventPublisher` as a DI singleton for downstream use cases/handlers.
- Added scoped bindings for all new repositories in `apps/server/src/di/container.ts`, replacing direct use of `packages/db/repositories`.

## Milestone 5 Notes (Use cases)

- Added initial application layer use cases under `apps/server/src/application`:
  - Chat: `CreateChat`, `RenameChat`.
  - Message: `PostMessage`.
- Use cases orchestrate validation via `Guard`, enforce membership via `OrganizationMemberRepository`, use transactional boundaries through `UnitOfWork`, and publish domain events via `DomainEventPublisher` when aggregates emit them.
- DI now exposes scoped bindings for these use cases to be consumed by interfaces (routes/workflows) in the next milestone.
