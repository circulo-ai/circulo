# Self-Hosting Trigger.dev (Local Docker)

This project is configured to work with a self-hosted Trigger.dev v4 instance.

Prerequisites
- Docker Desktop (latest)
- Git
- Node.js 20+
- pnpm 10+

Quick Start (Windows PowerShell)
1. Clone the Trigger.dev repo and start services:
   - `git clone https://github.com/triggerdotdev/trigger.dev trigger.dev`
   - Webapp: `cd trigger.dev/hosting/docker/webapp && copy .env.example .env && docker compose up -d`
   - Worker: `cd ../worker && copy .env.example .env`
2. Open the Trigger.dev Webapp at `http://localhost:8030` and create a Project, e.g. `circulo`.
3. From the Webapp, create a Worker Token (Projects → Workers → New Worker) and add it to `trigger.dev/hosting/docker/worker/.env` (`TRIGGER_WORKER_TOKEN=...`).
4. Start the Worker: `cd trigger.dev/hosting/docker/worker && docker compose up -d`.
5. Configure app env:
   - In `web/.env`, set: `TRIGGER_API_URL=http://localhost:8030` and `TRIGGER_SECRET_KEY=<Project Environment Secret from Webapp>`.
6. Initialize and deploy tasks:
   - `pnpm run trigger:init` (uses project `circulo` from `trigger.config.ts`)
   - `pnpm run trigger:deploy`
7. Development:
   - `pnpm dev` (starts Next.js and Trigger.dev dev session connected to your local Webapp).

Notes
- The `TRIGGER_SECRET_KEY` identifies the Project Environment (Dev/Prod).
- The `TRIGGER_API_URL` points the SDK/CLI to your self-hosted Webapp API.
- You can secure the local Webapp with the variables from: https://trigger.dev/docs/self-hosting/env/webapp.
- Worker-specific environment variables are here: https://trigger.dev/docs/self-hosting/env/supervisor.

Troubleshooting
- If `docker compose up -d` fails, ensure Docker Desktop is running and WSL2 is enabled.
- If the CLI cannot connect, verify `TRIGGER_API_URL` (`http://localhost:8030`) and that Webapp and Worker are healthy.
- Ensure you used the correct Project Environment secret key in `.env`.