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
DEMO_ACCESS_CODE=
DEMO_SESSION_TTL_MINUTES=60
DEMO_MAX_ACTIVE_SESSIONS=25
DEMO_SESSION_RATE_LIMIT_PER_MINUTE=10
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED=false
NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=false
REQUIRE_INTEGRATIONS_HEALTH=true
REQUIRE_INTEGRATION_PROVIDERS=github
CSP_ENFORCE=true
AI_ENABLED=true
GEMINI_API_KEY=
OPENAI_API_KEY=
TAVILY_API_KEY=
AI_GLOBAL_DAILY_LIMIT=5000
AI_GLOBAL_PER_MINUTE_LIMIT=120
AI_USER_DAILY_LIMIT=200
AI_USER_PER_MINUTE_LIMIT=20
AI_WORKFLOW_DAILY_LIMIT=50
AI_CHAT_DAILY_LIMIT=200
AI_DEMO_DAILY_LIMIT=3
AI_DEMO_PER_MINUTE_LIMIT=1
AI_DEMO_WORKFLOW_DAILY_LIMIT=2
AI_DEMO_CHAT_DAILY_LIMIT=1
AI_ADMIN_DAILY_LIMIT=400
AI_ADMIN_PER_MINUTE_LIMIT=40
AI_ADMIN_WORKFLOW_DAILY_LIMIT=100
AI_ADMIN_CHAT_DAILY_LIMIT=400
AI_MAX_STEPS_PER_WORKFLOW=4
TRUSTED_PROXY_COUNT=1
HEALTH_CHECK_TOKEN=generate-with-openssl-rand-hex-32
WORKER_SHUTDOWN_GRACE_TIME=45 seconds
ONBOARDING_LAUNCH_AT=
```

Operational settings (all optional; defaults shown in `.env.production.example`):

| Variable | Used by | Purpose |
| --- | --- | --- |
| `TRUSTED_PROXY_COUNT` | web | Number of reverse proxies that append to `X-Forwarded-For` (Caddy/Nginx only = `1`, Cloudflare + Caddy = `2`). The client IP for rate limits and audit logs is taken that many hops from the right. Too low trusts a spoofable header; too high collapses everyone onto the proxy IP. Default `1`. |
| `HEALTH_CHECK_TOKEN` | web, scripts | Unlocks detailed `/api/health` output via `x-health-token` or `Authorization: Bearer`. Anonymous callers get only per-service `status`; the HTTP status code (200 / 503 when unhealthy) is what container health checks rely on. The smoke and maintenance scripts read it from `.env.production`. |
| `WORKER_SHUTDOWN_GRACE_TIME` | worker | How long in-flight activities may run after SIGTERM before the worker exits (e.g. `45 seconds`, `1m`; invalid values fall back to `45 seconds`). Must stay below the worker's `stop_grace_period` (60s) in `docker-compose.prod.yml`. |
| `ONBOARDING_LAUNCH_AT` | web | ISO 8601 instant (e.g. `2026-11-23T00:00:00Z`). Accounts created before it count as existing users and never see the first-run onboarding modal. Empty or invalid = built-in default `2026-11-23T00:00:00Z`. |
| `DEMO_SESSION_RATE_LIMIT_PER_MINUTE` | web | Demo logins allowed per minute per client IP. Raise it for visitors behind a shared office NAT; `DEMO_MAX_ACTIVE_SESSIONS` and the `AI_DEMO_*` limits remain the real cost guard. Empty/unset/invalid = `10`. |
| `CSP_ENFORCE` | web | `true` enforces the Content-Security-Policy, `false` sends report-only. Empty/unset = enforce in production, report-only otherwise. |
| `REQUIRE_INTEGRATION_PROVIDERS` | web | Comma list (`github`, `linear`) of providers whose missing credentials fail `/api/health`. Empty/unset = none required (unless legacy `REQUIRE_INTEGRATIONS_HEALTH=true`, which implies `github`). |
| `AI_GLOBAL_DAILY_LIMIT` / `AI_GLOBAL_PER_MINUTE_LIMIT` | web | Cost-runaway safety cap across ALL users. Defaults 5000/day, 120/min. |
| `AI_USER_DAILY_LIMIT` / `AI_USER_PER_MINUTE_LIMIT` | web | Per regular verified user (applies to research/embedding calls). Defaults 200/day, 20/min. |
| `AI_WORKFLOW_DAILY_LIMIT` / `AI_CHAT_DAILY_LIMIT` | web | Per-user per-feature daily caps. Defaults 50 and 200 (legacy `AI_WORKFLOWS_PER_DAY` / `AI_CHAT_MESSAGES_PER_DAY` still honoured as fallbacks). |
| `AI_ADMIN_DAILY_LIMIT` / `AI_ADMIN_PER_MINUTE_LIMIT` / `AI_ADMIN_WORKFLOW_DAILY_LIMIT` / `AI_ADMIN_CHAT_DAILY_LIMIT` | web | Verified admins. Defaults 400/day, 40/min, 100 workflows/day, 400 chat/day. |
| `AI_DEMO_DAILY_LIMIT` / `AI_DEMO_PER_MINUTE_LIMIT` / `AI_DEMO_WORKFLOW_DAILY_LIMIT` / `AI_DEMO_CHAT_DAILY_LIMIT` | web | Per temporary demo visitor. Defaults 3/day, 1/min, 2 workflows/day, 1 chat/day. |
| `AI_MAX_STEPS_PER_WORKFLOW` | web, worker | Max steps per AI workflow. Default 4. |

AI limit variables must be positive integers; empty or unset uses the default, an invalid value logs a warning and uses the default.

`docker-compose.prod.yml` passes environment variables to each service explicitly, so a value in `.env.production` only reaches a container when the service's `environment:` block lists it.

`GEMINI_API_KEY` is required for AI chat and workflows. `OPENAI_API_KEY` is only required for embeddings/RAG search. `TAVILY_API_KEY` is optional; web research returns a clear not-configured response when it is absent.

`REQUIRE_INTEGRATION_PROVIDERS=github` keeps the production health check strict for the GitHub App while Linear OAuth is deferred. Use `github,linear` only after Linear credentials are configured and you want missing Linear env to fail health.

`DEMO_ACCESS_CODE` is optional. For a recruiter-facing CV demo, keep it empty and rely on the `AI_DEMO_*` plus global limits. If abuse starts or you want a private demo link, set `DEMO_ACCESS_CODE` and also set `NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=true` so the login screen explains the code requirement up front.

Each public demo login gets its own temporary user and workspace. `DEMO_SESSION_TTL_MINUTES` controls expiry, `DEMO_MAX_ACTIVE_SESSIONS` bounds concurrent storage, and expired users are removed in bounded batches during later demo logins. `AI_DEMO_*` limits apply per temporary visitor while the global daily limit remains the hard budget ceiling.

`pnpm smoke:prod` runs three AI workflows: document generation, task breakdown, and Living Plan impact analysis.

## Images

The `Dockerfile` has one slim target per service; all run as the unprivileged
`node` user on `node:24-bookworm-slim` and share one `builder` stage:

| Target | Compose service | Contents | Command |
| --- | --- | --- | --- |
| `web` | `web` | Next.js `output: "standalone"` server (traced runtime files only), `.next/static`, `public` | `node apps/web/server.js` |
| `worker` | `worker` | `@nexus/workflows` built by tsup + production dependencies (`pnpm deploy --prod`), Temporal core-bridge for the build platform only | `node dist/worker.js` |
| `collaboration` | `collaboration` | `src/server/collaboration.ts` bundled with esbuild into one file (no `node_modules`) | `node dist-collab/collaboration.mjs` |
| `migrate` | `migrate` (profile `tools`) | drizzle-kit, SQL migrations, guarded baseline script | `pnpm db:migrate` |

The app images contain no `pnpm`, `tsx` or source tree: **run migrations with
the `migrate` service**, not through `web`:

```bash
# old (no longer works: the web image is a standalone Next.js server)
#   docker compose ... run --rm --no-deps web pnpm db:migrate
# new
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
```

`migrate` waits for a healthy `postgres` (it is started if needed) and exits
when done; a second run is a no-op. It is never started by `up`.

Image names come from `NEXUS_IMAGE_PREFIX` / `NEXUS_IMAGE_TAG` in
`docker-compose.prod.yml` (default `nexus-web:latest`, `nexus-worker:latest`,
`nexus-collaboration:latest`, `nexus-migrate:latest`). The same file builds
locally (`build:` + `target:`) and pulls registry images when the prefix points
at a registry.

Build-time values: the `NEXT_PUBLIC_*` variables are inlined into the browser
bundle when the web image is built (they are build args, labelled on the image
as `org.nexus.next-public-*`), and the security headers from `next.config.ts`,
including the `CSP_ENFORCE` choice and the collaboration origin in the CSP,
are computed at build time as well. Rebuild the images after changing any of
them. Server-side settings (secrets, limits, `DATABASE_URL`, ...) are still
read from the container environment at runtime.

`docker buildx bake -f docker-bake.hcl` builds all four targets in one go
(used by CI; see the file header for tag/prefix variables).

## Start

```bash
export APP_COMMIT_SHA="$(git rev-parse HEAD)"
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
$COMPOSE build
$COMPOSE up -d postgres temporal
$COMPOSE run --rm migrate
$COMPOSE up -d
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
```

For later releases use `scripts/deploy.sh` (next section).

Container logs rotate at 20MB x 5 files per service (json-file driver); the setting only applies when a container is recreated (`up -d` after a compose change).

### Updating a running deployment (deploy order)

Roll out in this order so new code never runs against an old schema and the
worker understands every workflow the new web can start:

1. **Migrate** with the new image, before any new code serves traffic.
   Migrations must stay backward compatible with the code still running.
2. **Worker**: SIGTERM drains in-flight activities for
   `WORKER_SHUTDOWN_GRACE_TIME`, then it restarts on the new workflow code.
3. **Web and collaboration together**: they share `COLLAB_AUTH_SECRET` and the
   collaboration token format, so do not run mismatched versions.

#### Default: prebuilt images from GHCR (`scripts/deploy.sh`)

Every push to `main` that passes CI (lint, type check, build, tests, E2E and
the image smoke tests) publishes all four images for `linux/arm64`:

```
ghcr.io/zexy2/nexus-web            :main  :sha-<7-char commit>
ghcr.io/zexy2/nexus-worker         :main  :sha-<7-char commit>
ghcr.io/zexy2/nexus-collaboration  :main  :sha-<7-char commit>
ghcr.io/zexy2/nexus-migrate        :main  :sha-<7-char commit>
```

(the `publish` job in `.github/workflows/ci.yml`; it can also be started by
hand with **Run workflow** on `main`). The server only pulls, so it no longer
needs build cache, dev dependencies or several GB of free disk per deploy.

On the server, from the repository checkout (`~/Nexus`):

```bash
scripts/deploy.sh                # deploy :main (resolved to its sha-<commit> tag)
scripts/deploy.sh sha-1a2b3c4    # deploy one specific build
scripts/deploy.sh --rollback     # back to the previously running images (no migrate)
```

What `deploy.sh <tag>` does, stopping at the first failure:

1. **Preflight**: docker + compose reachable, `.env.production` present, at
   least 3GB free on Docker's data disk (`DEPLOY_MIN_FREE_GB`).
2. `git pull --ff-only` (compose file and scripts; it re-executes itself if
   `deploy.sh` changed).
3. **Backup**: `pg_dump` of the app database to
   `~/Avenox-Backups/nexus-predeploy/nexus-predeploy-<UTC stamp>.sql.gz`
   (mode 600, newest 10 kept; `DEPLOY_BACKUP_DIR`, `DEPLOY_BACKUP_KEEP`).
4. **Pull** `ghcr.io/zexy2/nexus-*:<tag>`. `main` is resolved to the immutable
   `sha-<commit>` tag through the image's `org.opencontainers.image.revision`
   label, so every service runs the same build even if `main` moves.
5. **Public build values check**: the web image's `org.nexus.next-public-*`
   labels must equal the `NEXT_PUBLIC_*` values in `.env.production`
   (they are baked into the browser bundle). A mismatch aborts before anything
   changes; fix the repository variables (below) or set
   `DEPLOY_SKIP_PUBLIC_ENV_CHECK=1` deliberately.
6. Records the running images in `.deploy/previous` (for `--rollback`)
   before anything running is changed, including on the very first run. A
   registry ref shared by all three services (`ghcr.io/zexy2/nexus-*:sha-...`)
   is recorded as is; anything else (compose-built `nexus-<svc>` images,
   `latest`, mixed versions) is pinned by tagging the running image IDs as
   `nexus-<svc>:rollback-pre-<UTC stamp>` and recording that.
7. **Migrate** (`docker compose run --rm migrate`), then **worker** (waits for
   "Waiting for workflows"), then **web + collaboration** (waits for both
   container health checks, `DEPLOY_HEALTH_TIMEOUT`, default 240s).
8. `GET /api/health` with `HEALTH_CHECK_TOKEN` must return 200.
9. Records `.deploy/current` and appends `.deploy/history`, then removes app
   images other than the current and previous releases (`docker image prune`
   for dangling layers). Pruning is skipped entirely when no previous release
   is recorded, and it never removes an image used by any container, an image
   the current/previous refs point at, or any `rollback-*` tag (remove old
   `rollback-*` tags by hand when they are no longer wanted).

On failure it prints `compose ps` and the worker/web/collaboration logs and
exits non-zero. **It never rolls the database back**: the pre-deploy dump is
there for a manual restore (see Backups). `scripts/deploy.sh --rollback`
switches worker, web and collaboration back to the recorded previous images
without running migrations, which is why migrations must stay backward
compatible with the previous release. Rolling back to an image built before
the per-service Dockerfile targets (the old shared `nexus-*:latest` image)
is supported: the script adds the old worker/collaboration commands
automatically.

Packages must be pullable by the server. GHCR creates new packages as
**private** and has no API to change that, so after the first publish the
owner makes each of the four packages public once: github.com/zexy2 ->
Packages -> `nexus-web` (then `nexus-worker`, `nexus-collaboration`,
`nexus-migrate`) -> Package settings -> Danger Zone -> Change visibility ->
Public. Check anonymously with
`curl -s "https://ghcr.io/token?scope=repository:zexy2/nexus-web:pull"`
(a token in the reply = public). Alternatively keep them private and run
`docker login ghcr.io -u zexy2` once on the server with a personal access
token that has only `read:packages`.

Build-time values for the published web image come from repository
variables (Settings -> Secrets and variables -> Actions -> Variables):
`NEXT_PUBLIC_APP_URL` (default `https://nexus.zekiakgul.dev`),
`NEXT_PUBLIC_COLLABORATION_URL` (default `wss://nexus.zekiakgul.dev/collab`),
`NEXT_PUBLIC_DEMO_MODE` (`true`), `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED`
(`false`), `NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED` (`false`). They must match
the server's `.env.production`; step 5 enforces it. After changing a
variable, re-run the workflow on `main`.

#### Fallback: build on the server

If GHCR or Actions is unavailable, the same compose file still builds
locally (needs several GB of free disk for the build cache):

```bash
export APP_COMMIT_SHA="$(git rev-parse HEAD)"
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
$COMPOSE build web worker collaboration migrate
$COMPOSE run --rm migrate                         # 1. migrate
$COMPOSE up -d --no-deps worker                   # 2. worker
$COMPOSE up -d --no-deps web collaboration        # 3. web + collab
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
docker builder prune -f                           # reclaim the build cache
```

Local builds are tagged `nexus-<service>:latest` (`NEXUS_IMAGE_PREFIX` and
`NEXUS_IMAGE_TAG` unset). `NEXUS_IMAGE_PREFIX=nexus NEXUS_IMAGE_TAG=latest
scripts/deploy.sh latest` runs the same guarded rollout (backup, migrate,
ordered restart, health) for those local images.

The block above under **Start** is for the first install only.

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

location /collab/ {
  # Both trailing slashes are required: /collab/<docId> becomes /<docId>
  # before the collaboration server validates the signed document token.
  proxy_pass http://127.0.0.1:1234/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Smoke Checks

```bash
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
```

Optional browser smoke after the Gemini key is ready:

```bash
DEMO_E2E=true pnpm --filter @nexus/web exec playwright test e2e/demo-production.spec.ts --project=chromium
```

Expected:

- Web health endpoint returns 200.
- Postgres is healthy.
- Worker connects to Temporal namespace `default` and `/api/health` reports `services.worker.status`.
- AI provider status is `configured` when `GEMINI_API_KEY` is set.
- Collaboration service listens on port 1234.
- Demo login works through `POST /api/demo/session`; each browser receives an isolated, expiring workspace and no credential is exposed to the client bundle.
- The production smoke test creates two demo sessions and verifies that cross-session document access returns `404`.
- `pnpm smoke:prod` starts and completes one real AI document workflow.
- `pnpm smoke:prod` starts and completes one real task breakdown workflow from the generated document and verifies at least one task.
- `pnpm smoke:prod` starts one Living Plan impact workflow, waits for a pending change set, applies selected proposals, and verifies the change set resolves as `applied` or `partially_applied`.
- `/api/health` reports the deployed `commitSha` and warns when an external write remains non-terminal for more than five minutes.
- Anonymous `/api/health` returns only overall and per-service `status`. Detailed output (commit, latencies, provider/integration configuration) requires `HEALTH_CHECK_TOKEN` (`x-health-token` header or `Authorization: Bearer`) or a verified admin session; the smoke and maintenance scripts send the token when it is set in `.env.production`.
- For quota verification, temporarily set `AI_USER_DAILY_LIMIT=1`, restart web, and confirm the second AI request returns `429`.

Retention note: `rate_limit_buckets` and `audit_logs` are intentionally simple for the portfolio demo. Before long-running public usage, add a scheduled cleanup for expired buckets and old audit rows.

## Backups

Run Postgres backups from the VPS:

```bash
pnpm backup:postgres
```

For the public demo VPS, install the maintenance timers once:

```bash
BASE_URL=https://your-domain.com pnpm maintenance:install-vps
```

This installs four systemd timers:

- `nexus-health-check.timer` runs every five minutes and calls `/api/health`.
  It does not call AI endpoints and does not create fake CPU/network load.
- `nexus-postgres-backup.timer` writes a daily Postgres dump to `backups/`
  and prunes old `nexus-YYYY-*` backups after 14 days by default.
- `nexus-docker-cleanup.timer` runs a conservative weekly cleanup for old
  build cache, dangling images, and stopped containers. It does not prune
  volumes. Tagged app images are pruned by `scripts/deploy.sh` itself (it
  keeps the current and previous release for rollback); pre-deploy dumps
  live separately in `~/Avenox-Backups/nexus-predeploy` (newest 10).
- `nexus-db-cleanup.timer` runs daily (`scripts/maintenance-db-cleanup.sh`,
  also `pnpm maintenance:db-cleanup`) and deletes `workflow_activity_receipts`
  rows older than `RECEIPT_RETENTION_DAYS` (default 30, minimum 7). Receipts
  only matter while a workflow can still retry the activity, and the longest
  workflow wait is the 72h plan-impact review. Results are logged to
  `logs/maintenance/db-cleanup-*.log`.

Already-installed VPSes pick up a new timer by re-running
`pnpm maintenance:install-vps`; it is idempotent.

Verify restore periodically on a staging database and confirm `CREATE EXTENSION vector` exists.

Restore example:

```bash
cat backups/nexus-YYYY-MM-DD.sql | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```
