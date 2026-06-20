# Nexus Docker VPS Deployment

Nexus v1 targets a single-team Docker VPS deployment with server-managed AI provider keys.

## Required Secrets

Create a production env file outside git, for example `.env.production`:

```bash
POSTGRES_USER=nexus
POSTGRES_PASSWORD=change-me
POSTGRES_DB=nexus
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
BETTER_AUTH_URL=https://your-domain.com
AUTH_TRUSTED_ORIGINS=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_COLLABORATION_URL=wss://your-domain.com/collab
TEMPORAL_NAMESPACE=default
DEMO_MODE=true
PUBLIC_SIGNUP_ENABLED=false
ADMIN_EMAILS=your-email@example.com
DEMO_EMAIL=demo@your-domain.com
DEMO_PASSWORD=change-this-demo-password
DEMO_ACCESS_CODE=
DEMO_SEED_TOKEN=generate-a-one-time-seed-token
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED=false
NEXT_PUBLIC_DEMO_EMAIL=demo@your-domain.com
NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=false
AI_ENABLED=true
GEMINI_API_KEY=
OPENAI_API_KEY=
TAVILY_API_KEY=
AI_GLOBAL_DAILY_LIMIT=40
AI_GLOBAL_PER_MINUTE_LIMIT=2
AI_USER_DAILY_LIMIT=6
AI_USER_PER_MINUTE_LIMIT=1
AI_WORKFLOW_DAILY_LIMIT=2
AI_CHAT_DAILY_LIMIT=4
AI_DEMO_DAILY_LIMIT=12
AI_DEMO_PER_MINUTE_LIMIT=1
AI_DEMO_WORKFLOW_DAILY_LIMIT=4
AI_DEMO_CHAT_DAILY_LIMIT=8
AI_MAX_STEPS_PER_WORKFLOW=5
```

`GEMINI_API_KEY` is required for AI chat and workflows. `OPENAI_API_KEY` is only required for embeddings/RAG search. `TAVILY_API_KEY` is optional; web research returns a clear not-configured response when it is absent.

`DEMO_ACCESS_CODE` is optional. For a recruiter-facing CV demo, keep it empty and rely on the `AI_DEMO_*` plus global limits. If abuse starts or you want a private demo link, set `DEMO_ACCESS_CODE` and also set `NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=true` so the login screen explains the code requirement up front.

`pnpm smoke:prod` runs three AI workflows: document generation, task breakdown, and Living Plan impact analysis. The shared demo account uses the separate `AI_DEMO_*` limits so one recruiter does not exhaust the normal per-user quota for every later visitor. The global daily limit remains the hard budget ceiling.

## Start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml exec web pnpm db:migrate
docker compose --env-file .env.production -f docker-compose.prod.yml exec web pnpm demo:seed-user
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
```

Use migrations in production. `db:push` is local-development only and should not be part of a VPS deploy.
`pnpm db:migrate` also performs a guarded one-time baseline when it detects an
existing schema created before migration history was enabled. It refuses to
baseline incomplete schemas.

## Reverse Proxy

Terminate HTTPS at Caddy, Nginx, or Traefik. Forward normal HTTP traffic to `web:3000` and websocket collaboration traffic to `collaboration:1234`.

The production compose file does not publish Temporal's internal `7233` port. Temporal UI, Jaeger, OTEL, and collaboration default to `127.0.0.1` bindings; expose them only through SSH tunnels or a protected reverse proxy rule.

Minimal Nginx shape:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /collab {
  proxy_pass http://127.0.0.1:1234;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Smoke Checks

```bash
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
```

Optional browser smoke after the demo user and Gemini key are ready:

```bash
DEMO_E2E=true pnpm --filter @nexus/web exec playwright test e2e/demo-production.spec.ts --project=chromium
```

Expected:

- Web health endpoint returns 200.
- Postgres is healthy.
- Worker connects to Temporal namespace `default` and `/api/health` reports `services.worker.status`.
- AI provider status is `configured` when `GEMINI_API_KEY` is set.
- Collaboration service listens on port 1234.
- Demo login works through `POST /api/demo/session`; the password is never exposed to the client bundle.
- `pnpm smoke:prod` starts and completes one real AI document workflow.
- `pnpm smoke:prod` starts and completes one real task breakdown workflow from the generated document and verifies at least one task.
- `pnpm smoke:prod` starts one Living Plan impact workflow, waits for a pending change set, applies selected proposals, and verifies the change set resolves as `applied` or `partially_applied`.
- For quota verification, temporarily set `AI_USER_DAILY_LIMIT=1`, restart web, and confirm the second AI request returns `429`.

Retention note: `rate_limit_buckets` and `audit_logs` are intentionally simple for the portfolio demo. Before long-running public usage, add a scheduled cleanup for expired buckets and old audit rows.

## Backups

Run daily Postgres backups from the VPS:

```bash
pnpm backup:postgres
```

Verify restore periodically on a staging database and confirm `CREATE EXTENSION vector` exists.

Restore example:

```bash
cat backups/nexus-YYYY-MM-DD.sql | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```
