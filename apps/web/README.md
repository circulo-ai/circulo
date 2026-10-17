# Circulo web application

The web application is the browser interface for Circulo. It uses Next.js and
connects to the Hono API in [`apps/server`](../server/README.md).

## Run locally

Configure the repository-level environment files and start the supporting
services from the repository root. See the [root README](../../README.md) for
the complete setup.

```bash
bun install --frozen-lockfile
docker compose -f apps/web/docker-compose.yml up -d
bun run db:migrate
bun run dev:stack
```

The web application runs at `http://localhost:3000`. The API defaults to
`http://localhost:3002`.

## Environment

Use `apps/web/.env.example` as the starting point for `apps/web/.env.local`.
Use `apps/server/.env.example` for API and provider configuration. Keep local
secrets in those ignored files and do not add them to source control.

## Useful commands

Run these commands from the repository root:

```bash
bun --filter web typecheck
bun --filter web test
bun --filter web build
```

The production build uses the Webpack build path configured in the package
script. Repository-wide lint and formatting commands are documented in the
[root README](../../README.md).

## Related documentation

- [Self-hosting](../../docs/self-hosting.md)
- [Repository contribution guide](../../CONTRIBUTING.md)
- [Security policy](../../SECURITY.md)
