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

Production requires valid values for `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, and the AI/provider credentials used by configured agents. Database changes are applied with `bun --filter @circulo-ai/db db:migrate`.

## Security boundaries

All organization data routes require authentication and organization membership. Reconnectable workflow stream IDs are stored with their chat, user, and organization ownership, and reconnect requests are checked against that record. Chat deletion is a recoverable soft delete. Development-only workflow demonstrations are not mounted in production. The API exposes `/health` for liveness and `/health/ready` for database/cache readiness checks.

## Architecture direction

New application behavior belongs in use cases and repository ports, with Drizzle adapters at the infrastructure boundary. Routes validate requests, authorize the actor, call a use case, and translate the result into HTTP/stream responses. Durable workflows receive only serializable actor identity (`userId` and `organizationId`), never a live authentication session or secret.
