# Nexus

A production-oriented AI workspace for documents, tasks, server-managed AI assistance, and durable background workflows.  
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
pnpm db:push      # push schema to database
pnpm db:migrate   # run migrations for production
pnpm demo:seed-user # create/update the public demo user through the auth API
pnpm backup:postgres # write a VPS Postgres backup
pnpm smoke:prod   # run Docker VPS smoke checks
pnpm db:studio    # open drizzle studio
```

## Gotchas

- **First run?** Make sure Docker is running before `pnpm dev`
- **Database errors?** Run `pnpm db:push` to sync the schema
- **Temporal not connecting?** Check `docker-compose ps` — temporal takes ~30s to start
- **pgvector missing?** The init script enables it, but check `scripts/init-db.sql` if issues persist
- **AI features not working?** You need `GEMINI_API_KEY` and `AI_ENABLED=true`
- **Public demo?** Set `DEMO_MODE=true`, `PUBLIC_SIGNUP_ENABLED=false`, and low `AI_*_LIMIT` values
- **Production deploy?** Use `docker-compose.prod.yml` and `docs/DEPLOYMENT.md`
- **Zero sync?** v1 is API-backed sync/offline queue; production Zero cache is deferred until schema compatibility is restored

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind · PostgreSQL · pgvector · Drizzle · BetterAuth · LangGraph · Temporal · Turborepo

## Docs

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture Decisions](docs/adr/)

## License

MIT
