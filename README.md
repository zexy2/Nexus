# Nexus

Nexus is a portfolio-demo AI workflow workspace that keeps project plans and delivery work aligned.

**Product promise:** Change the plan once. Nexus finds the impacted work, proposes updates, and changes the Kanban board only after human approval.

This is not positioned as a full Jira, Linear, or Notion replacement. It is a focused public demo that proves one workflow end to end:

```text
Project idea -> Living Plan -> Requirements -> Kanban tasks -> Impact review -> Approved changes -> Workflow history
```

## Why It Exists

ChatGPT can turn a prompt into a task list. That is not the hard part.

The harder problem is what happens after the plan changes:

- Which requirements were added, changed, or removed?
- Which existing tasks are now stale?
- Which requirements have no delivery work attached?
- Which task updates should be applied, and which should be rejected?
- Can the team see the execution trail behind the AI suggestion?

Nexus treats the plan as a versioned delivery artifact, not a disposable chat response.

## What Nexus Does

- Generates a project plan with server-managed AI.
- Extracts stable requirement IDs such as `REQ-001`.
- Links requirements to Kanban tasks.
- Shows requirement coverage and task alignment status.
- Analyzes plan changes against the previous accepted version.
- Creates reviewable change proposals instead of mutating work automatically.
- Applies only the proposals selected by the user.
- Records workflow runs, audit events, failures, and approval history.

## Core Demo Flow

For a reviewer, the intended 5-minute path is:

1. Sign in with the configured demo account.
2. Create or open a project plan.
3. Run the first Living Plan analysis.
4. Review extracted requirements and generated work proposals.
5. Apply selected proposals.
6. Open the Kanban board and inspect linked tasks.
7. Edit the plan and run impact analysis again.
8. Review the workflow history to see running, completed, and failed executions.

## Current Demo Status

Nexus is built for a controlled public demo on a Docker VPS.

- Public signup is disabled by default.
- Demo login is handled server-side; demo passwords are not exposed in the client bundle.
- AI uses a server-managed Gemini key with daily quotas and rate limits.
- If AI is disabled or the provider key is missing, endpoints return clear `503` unavailable states instead of mock output.
- If quota is exceeded, endpoints return `429 RATE_LIMIT_EXCEEDED`.
- The current deployment target is Oracle Free Tier VPS. Public access still requires cloud ingress rules, a domain/HTTPS setup, and a configured `GEMINI_API_KEY`.

Do not commit real `.env.production`, API keys, demo passwords, or access codes.

## Tech Stack

| Area             | Stack                                                 |
| ---------------- | ----------------------------------------------------- |
| Web app          | Next.js 16, React 19, TypeScript, Tailwind            |
| Auth             | Better Auth                                           |
| Database         | PostgreSQL, pgvector, Drizzle ORM                     |
| Workflows        | Temporal worker and workflow history                  |
| AI orchestration | LangGraph agents with server-managed Gemini           |
| Collaboration    | Yjs / Hocuspocus                                      |
| Deployment       | Docker Compose, Nginx reverse proxy, VPS smoke checks |

## Architecture Shape

```text
apps/web
  Next.js UI, API routes, auth, dashboard, Living Plan screens

packages/database
  Drizzle schema for docs, tasks, requirements, change sets,
  audit logs, rate limits, workflow runs, and worker health

packages/workflows
  Temporal workflow definitions for document generation,
  task breakdown, and Living Plan impact analysis

packages/agents
  LangGraph agent and AI helper code
```

## Local Development

Requirements:

- Node.js 20+
- pnpm 10+
- Docker
- Gemini API key for AI workflows
- OpenAI API key only if you want embeddings/RAG search

Start the full local demo:

```bash
git clone https://github.com/zexy2/Nexus.git
cd Nexus
pnpm install
cp .env.example apps/web/.env.local
pnpm dev:local
```

Open [http://localhost:3000](http://localhost:3000).

`pnpm dev:local` starts Docker services, prepares the database, seeds the demo user, and runs the web app, Temporal worker, and collaboration server. When restarted, it clears old local Node processes before starting new ones.

## Useful Scripts

```bash
pnpm dev:local          # one-command local demo
pnpm build              # production build
pnpm lint               # lint packages
pnpm type-check         # TypeScript checks
pnpm test               # test suite
pnpm db:migrate         # production-safe migrations + guarded legacy baseline
pnpm db:push            # local disposable DB only
pnpm demo:seed-user     # create/update demo user
pnpm smoke:prod         # Docker VPS smoke test
pnpm backup:postgres    # write a Postgres backup
```

## Production Deployment Summary

The production target is a single-team Docker VPS demo:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml exec web pnpm db:migrate
docker compose --env-file .env.production -f docker-compose.prod.yml exec web pnpm demo:seed-user
SMOKE_BASE_URL=https://your-domain.com pnpm smoke:prod
```

Production uses migrations. `db:push` is local-only and should not be used for deploys.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for environment variables, reverse proxy notes, smoke checks, and backups.

## What Makes It Different From a Chat Prompt

Nexus is useful only if it proves these things:

- AI output becomes persistent product data, not copied text.
- Requirements keep stable IDs across plan revisions.
- Tasks are linked to requirements and can become aligned, stale, or orphaned.
- AI proposes changes, but the user approves what actually mutates the board.
- Every workflow leaves an inspectable execution trail.

If those guarantees are removed, Nexus becomes a thin ChatGPT wrapper. The current product direction is intentionally built around avoiding that.

## Known Limits

- This is a portfolio demo, not a full multi-tenant SaaS.
- Server-managed AI requires budget controls; public demo quotas should stay low.
- BYOK is intentionally deferred until the Living Plan value is proven.
- OpenAI embeddings/RAG are optional and return unavailable states when not configured.
- Production Zero cache is deferred; v1 uses API-backed sync and offline queue behavior.
- A real public CV link needs VPS ingress, HTTPS, and provider secrets configured.

## Documentation

- [Product Requirements](docs/PRD.md)
- [Project Status](docs/STATUS.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture Decisions](docs/adr/)

## License

MIT
