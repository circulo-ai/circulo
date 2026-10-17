# Circulo

Circulo is a multi-tenant AI workspace for teams. It combines a web chat
application, an API, organization-managed agents, and durable workflows in a
Bun and Turborepo monorepo.

## Repository layout

| Path                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `apps/web`              | Next.js application and browser client                       |
| `apps/server`           | Hono API, authentication, AI tools, and workflow runtime     |
| `apps/desktop`          | Electron application with a local API, database, and storage |
| `packages/core`         | Domain and application primitives                            |
| `packages/db`           | Drizzle schema and database migrations                       |
| `packages/di`           | Dependency injection container and framework adapters        |
| `packages/upload`       | File upload providers and routes                             |
| `packages/file-parsers` | Document and data parsers                                    |
| `packages/redis`        | Redis client helpers                                         |
| `packages/wf`           | Durable workflow engine                                      |
| `packages/wf-cli`       | Static workflow authoring and CI commands                    |
| `packages/types`        | Shared TypeScript contracts                                  |

Each application and package may have its own README with component-specific
setup and API details.

## Requirements

- Bun 1.3.4 (the version recorded in `packageManager`)
- Node.js 20 or newer
- Docker with the Compose plugin
- Provider credentials only for the integrations you plan to use

## Local development

Copy the example environment files, then replace any placeholder secrets and
configure the providers you need:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

Install dependencies, start PostgreSQL, Redis, and MinIO, apply migrations,
and start the web and API applications:

```bash
bun install --frozen-lockfile
docker compose -f apps/web/docker-compose.yml up -d
bun run db:migrate
bun run dev:stack
```

The web application is at `http://localhost:3000`; the API is at
`http://localhost:3002`. The API exposes `/health` for liveness and
`/health/ready` for dependency readiness.

## Build and verification

Run repository checks from the root:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

Some integrations require valid local credentials. Keep secrets in ignored
environment files and never commit production credentials or generated build
output.

## Documentation

- [Self-hosting](docs/self-hosting.md)
- [Workflow timing and message display](docs/workflow-timing-and-message-contrast.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security reporting](SECURITY.md)
- [Support](SUPPORT.md)

## Releases

Public packages are versioned with [Changesets](.changeset/README.md) and
published by GitHub Actions after the release pull request is merged. Desktop
installers are built for Windows, macOS, and Linux by the `Release - Desktop`
workflow. Pushing a `desktop-v<version>` tag that matches
`apps/desktop/package.json` publishes a GitHub Release with the installers.
See [the desktop README](apps/desktop/README.md) for details.

## License

This monorepo does not currently declare one root license. Published packages
carry package-level `LICENSE` files where applicable; check the relevant
package before reusing its code.
