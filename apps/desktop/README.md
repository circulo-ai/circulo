# Circulo Desktop

The desktop app is a thin Electron shell around the existing Circulo web UI.
It starts a loopback-only API and web process, stores the database in PGlite,
stores files in the per-user Electron data directory, and does not require a
cloud account or external service.

## Development

From the repository root:

```bash
bun install
bun --cwd apps/desktop dev
```

The shell uses `apps/server` and `apps/web` from the current checkout. The
local database is persisted under Electron's user-data directory and uses the
same Drizzle migrations as PostgreSQL.

Useful overrides:

- `CIRCULO_DESKTOP_REPO` — repository root when launched outside the checkout.
- `CIRCULO_DESKTOP_WEB_URL` — use an already-running web UI.
- `CIRCULO_DESKTOP_SKIP_SERVER=1` — do not start the local API.
- `CIRCULO_DESKTOP_SKIP_WEB=1` — do not start the local web UI.

The preload bridge exposes only runtime status and paths. Renderer code does
not receive Node.js or filesystem access.

## Installers and updates

Build the packaged runtime and platform installers from the repository root:

```bash
bun run desktop:package
```

The build produces Windows NSIS/portable, macOS DMG/ZIP, and Linux
AppImage/DEB artifacts under `apps/desktop/dist`. The packaged application
contains the Node-compatible API bundle, Next standalone runtime, PGlite
migrations, and local storage defaults. Electron Builder's generic update
provider is configured in `apps/desktop/package.json`; use
`CIRCULO_UPDATE_URL` or replace the publish URL for the release environment.
Code-signing secrets belong in CI and are not committed.

## Cloud pairing

While signed in to the cloud workspace, call `POST /api/sync/pairing/start`
with the desktop device ID. Exchange the one-time token through
`POST /api/sync/pairing/exchange`; the resulting device credential is stored
locally and used for authenticated sync requests. Pairing tokens are
single-use and expire after ten minutes.
