# Circulo API

The Circulo API is a Hono application that handles authentication,
organization access, AI tools, file operations, and workflow execution. It is
implemented in TypeScript and runs on Bun for development and production
builds.

## Run locally

Start from the repository root. Configure the environment files, start
PostgreSQL, Redis, and MinIO, then apply database migrations:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
bun install --frozen-lockfile
docker compose -f apps/web/docker-compose.yml up -d
bun run db:migrate
bun run dev:server
```

The API listens on `http://localhost:3002` by default. Run `bun run dev:stack`
to start the API and web application together. The liveness endpoint is
`/health`; `/health/ready` checks configured dependencies.

## Configuration

Use `apps/server/.env.example` as the configuration reference. Database,
authentication, encryption, and internal API secrets are required for the
corresponding features. Provider credentials are needed only for integrations
you enable. Store secrets in the ignored `apps/server/.env` file; never commit
them.

## Build and verification

Run from the repository root:

```bash
bun --filter server typecheck
bun --filter server test
bun --filter server build
```

The server composes the workflow runtime in
[`src/workflows/runtime/wf-config.ts`](src/workflows/runtime/wf-config.ts).
Production workflows persist state in PostgreSQL and use Redis for event
delivery. PostgreSQL remains the source of truth for workflow history. For
deployment and health-check guidance, see [self-hosting](../../docs/self-hosting.md).

## Related documentation

- [Repository README](../../README.md)
- [Contribution guide](../../CONTRIBUTING.md)
- [Security policy](../../SECURITY.md)
