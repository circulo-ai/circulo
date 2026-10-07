# Self-hosting Circulo

Circulo can run as a self-hosted platform without Autumn, Stripe, or any other
Circulo cloud service. Self-hosted deployments use unlimited platform
entitlements by default. Model-provider costs remain the responsibility of the
operator and can be handled with deployment credentials, organization keys, or
user-owned BYOK credentials.

## Quick start

1. Copy `apps/server/.env.example` to `.env` at the repository root.
2. Set `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and `INTERNAL_API_SECRET`.
3. Add at least one model provider key, or run Ollama locally.
4. Start the stack:

```bash
docker compose -f docker-compose.self-hosted.yml up --build
```

5. Open `http://localhost:3000`.

The API is available at `http://localhost:3002`. The deployment includes
PostgreSQL, Redis, and MinIO so it is suitable for a small shared server. Set
`BILLING_ENABLED=false` to keep the deployment independent of cloud billing.
Set `CIRCULO_RUNTIME_KIND=self-hosted` for a shared self-hosted instance. The
first local account becomes the instance administrator and sign-up is disabled
after bootstrap until an administrator enables it in Settings → Account.

## Local runtime mode

For a single-process development or desktop-hosted runtime, set:

```dotenv
CIRCULO_DEPLOYMENT_MODE=local
CIRCULO_RUNTIME_KIND=desktop
CIRCULO_STORAGE_DRIVER=local
BILLING_ENABLED=false
```

Local mode permits local storage and an in-process workflow event bus. The
server can also use PGlite, an embedded PostgreSQL-compatible runtime that
reuses the same Drizzle schema and migrations:

```dotenv
CIRCULO_DATABASE_DRIVER=pglite
DATABASE_URL=pglite://local
PGLITE_DATA_DIR=.local-storage/pglite
CIRCULO_STORAGE_DRIVER=local
```

PGlite mode includes the pgvector extension required by knowledge embeddings.
It is the database runtime used by the Electron desktop shell.

## Desktop

The Electron shell lives in `apps/desktop` and starts the local API and web UI
on loopback with PGlite, local file storage, encrypted per-user secrets, and
no required cloud account:

```bash
bun --cwd apps/desktop dev
```

The sync protocol is available at `/api/sync/pull` and `/api/sync/push`.
Changes to chats, agents, memories, and artifacts are recorded in the
append-only sync journal. Configure `NEXT_PUBLIC_CIRCULO_CLOUD_SYNC_URL` to
replicate the local journal to a signed-in Circulo deployment when online.
Before the first sync, create a one-time token with
`POST /api/sync/pairing/start` in the cloud workspace and exchange it with
`POST /api/sync/pairing/exchange`; the browser stores the resulting revocable
device credential locally. Imported changes are idempotent, device-tagged,
and resolved with deterministic latest-write-wins ordering; losing changes are
kept in `sync_conflicts` for review.

Packaged desktop installers are built with `bun run desktop:package` and are
generated for Windows, macOS, and Linux through Electron Builder. The packaged
runtime includes the Node API bundle, Next standalone server, PGlite
migrations, and local storage profile.

## Provider configuration

Supported provider IDs include OpenRouter, OpenAI, Anthropic, Google, Ollama,
and generic OpenAI-compatible endpoints. Deployment credentials are configured
with environment variables; users can also add encrypted personal credentials
from Settings → AI providers.

Ollama does not require an API key:

```dotenv
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_API_KEY=ollama
```

## Upgrades and backups

The Docker image applies database migrations before starting the API. For a
native deployment, run database migrations before starting a new application
version:

```bash
bun run db:migrate
```

Back up PostgreSQL and the configured storage volume together. Chat history,
workflow state, usage events, and uploaded artifacts are separate persistence
concerns and must be restored as one unit.
