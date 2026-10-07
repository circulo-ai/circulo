# Circulo

Circulo is a multi-tenant AI workspace for teams. A user works inside an organization, creates a conversation, selects organization-owned agents, and sends a request. A durable orchestration workflow classifies the request, plans the best agent execution strategy, runs agents sequentially/in parallel/conditionally, persists their messages and artifacts, and streams progress plus the final response back to the chat UI.

The repository is a Bun/Turborepo monorepo:

- `apps/web` is the Next.js chat application.
- `apps/server` is the Hono/Bun API, authentication boundary, AI tools, and Circulo Workflow Engine runtime.
- `packages/db` contains the Drizzle schema, migrations, and legacy repositories.
- `packages/core`, `packages/di`, `packages/wf`, `packages/upload`, and `packages/file-parsers` provide reusable domain, dependency-injection, workflow, storage, and parsing capabilities.

## Local setup

Requirements: Bun 1.3+, Node 20+, Docker Desktop, and the credentials for the providers you intend to use. Copy the environment examples into local environment files and replace every placeholder secret:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
bun install
docker compose -f apps/web/docker-compose.yml up -d
bun run db:migrate
```

Start the applications together:

```bash
bun run dev:stack
```

The web app is at `http://localhost:3000`; the API is at `http://localhost:3002`.

## Verification and production build

```bash
bun run typecheck
bun run test
bun run build
```

The server build bundles the application and the Circulo Workflow Engine directly. Production orchestration state, workflow events, optimistic versions, and execution locks are stored in PostgreSQL, and interrupted runs are reclaimed on server startup. The live HTTP output channel is instance-local, so deployments with multiple API instances should use sticky routing for an active stream or add a shared pub/sub adapter at the load-balancer boundary.

The server composes the current `@circulo-ai/wf` 3.0 runtime through
`apps/server/src/workflows/runtime/wf-config.ts`. Runtime creation is lazy and
profile-aware (`development`, `test`, and `production`). Production uses the
durable PostgreSQL stores and `AdapterEventBus` over Redis; each API instance
has a dedicated Redis subscriber, while PostgreSQL remains the authoritative
workflow/event log. The runtime exposes engine health through
`/health/ready` and is closed, together with the scheduler, database pool, and
shared Redis client, on `SIGTERM`/`SIGINT`.

For a multi-instance deployment, configure `REDIS_URL` on every API instance
and run the database migrations before accepting traffic. The event transport
is deliberately not used as the source of truth: if a subscriber is restarted,
the chat workflow service replays persisted events from PostgreSQL. External
side effects in workflow steps must still use their own business idempotency
keys because `wf` provides at-least-once durable execution semantics.

Production requires valid values for `DATABASE_URL`, `BETTER_AUTH_URL`,
`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, and the
AI/provider credentials used by configured agents. Production storage defaults
to S3-compatible storage and also supports Azure Blob Storage with
`CIRCULO_STORAGE_DRIVER=azure`: configure the server containers/credentials
and set the web app's `NEXT_PUBLIC_STORAGE_ORIGINS` to the browser-reachable
storage origin(s) so presigned uploads satisfy CSP and CORS. `/health/ready`
verifies the configured buckets or containers before reporting production
readiness. If the API is
behind a reverse proxy, set `TRUSTED_PROXY_HOPS` and the matching
`TRUSTED_PROXY_IPS` CIDR/IP list. Database changes are applied with
`bun --filter @circulo-ai/db db:migrate`.

## Security boundaries

All organization data routes require authentication and organization membership. Reconnectable workflow stream IDs are stored with their chat, user, and organization ownership, and reconnect requests are checked against that record. Chat deletion is a recoverable soft delete. Development-only workflow demonstrations are not mounted in production. The API exposes `/health` for liveness and `/health/ready` for database/cache readiness checks.

## Architecture direction

New application behavior belongs in use cases and repository ports, with Drizzle adapters at the infrastructure boundary. Routes validate requests, authorize the actor, call a use case, and translate the result into HTTP/stream responses. Durable workflows receive only serializable actor identity (`userId` and `organizationId`), never a live authentication session or secret.

## Self-hosting

The repository includes a deployment-independent self-hosted stack in
`docker-compose.self-hosted.yml`. It runs the web app, API, PostgreSQL, Redis,
and MinIO without requiring Autumn or cloud billing. See
[`docs/self-hosting.md`](docs/self-hosting.md) for setup, provider configuration,
local runtime mode, and backup guidance.

Self-hosted mode has unlimited platform entitlements by default. The cloud
distribution may add billing and managed model credits through adapters, but
those services are not required by the open-source runtime.
