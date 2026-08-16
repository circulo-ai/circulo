Install dependencies from the repository root, then start the complete local stack:

```bash
bun install
docker compose -f apps/web/docker-compose.yml up -d
bun run db:migrate
bun run dev:stack
```

The web application is at `http://localhost:3000`. The API is at
`http://localhost:3002`; use `/health` for liveness and `/health/ready` to
verify PostgreSQL and Redis connectivity.
