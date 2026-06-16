# Nexus

A production-oriented public demo workspace for Living Plans, change impact review, Kanban work alignment, server-managed AI assistance, and durable background workflows.
Built with Next.js 16, PostgreSQL, LangGraph, and Temporal.

## Quick Start

```bash
git clone https://github.com/zexy2/Nexus.git
cd Nexus
pnpm install
cp .env.example apps/web/.env.local   # configure GEMINI_API_KEY
pnpm dev:local
```

Open [localhost:3000](http://localhost:3000)

`pnpm dev:local` starts Postgres/Temporal, prepares the DB, seeds the demo user, and runs the web app, Temporal worker, and collaboration server. Press `Ctrl+C` to stop the Node processes; Docker services remain running.

## Requirements

- Node 20+
- pnpm
- Docker
- Gemini API key for AI chat/workflows
- OpenAI API key only if you want embeddings/RAG search

## Layout

```
apps/web/           → Next.js app (frontend + API routes)
packages/agents/    → LangGraph agent implementations
packages/database/  → Drizzle ORM schema
packages/workflows/ → Temporal workflow definitions
```

## Scripts

```bash
pnpm dev:local    # one-command local demo: Docker + DB + seed + web + worker + collab
pnpm dev          # raw turbo dev
pnpm build        # production build
pnpm test         # run tests
pnpm lint         # eslint
pnpm type-check   # TypeScript checks
pnpm db:migrate   # run migrations; required for production deploys
pnpm db:push      # local development only: push schema to a disposable DB
pnpm demo:seed-user # create/update the public demo user through the auth API
pnpm backup:postgres # write a VPS Postgres backup
pnpm smoke:prod   # run Docker VPS smoke checks
pnpm db:studio    # open drizzle studio
```

## Gotchas

- **First run?** Make sure Docker is running before `pnpm dev:local`
- **Database errors?** Prefer `pnpm db:migrate`; use `pnpm db:push` only on a local disposable database
- **Temporal not connecting?** Check `docker-compose ps` — temporal takes ~30s to start
- **pgvector missing?** The init script enables it, but check `scripts/init-db.sql` if issues persist
- **AI features not working?** You need `GEMINI_API_KEY` and `AI_ENABLED=true`
- **Public demo?** Set `DEMO_MODE=true`, `PUBLIC_SIGNUP_ENABLED=false`, optional `DEMO_ACCESS_CODE`, and low `AI_*_LIMIT` values
- **Production deploy?** Use `docker-compose.prod.yml` and `docs/DEPLOYMENT.md`
- **Sync model?** v1 uses API-backed sync/offline queue behavior; a production Zero cache is deferred

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind · PostgreSQL · pgvector · Drizzle · BetterAuth · LangGraph · Temporal · Turborepo

## Docs

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture Decisions](docs/adr/)

## License

MIT
