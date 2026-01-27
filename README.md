# Nexus

A productivity app with offline-first sync, AI writing assistance, and background workflows.  
Built with Next.js 15, PostgreSQL, LangGraph, and Temporal.

<!-- 
TODO: Add demo video/GIF here
![Demo](assets/demo.gif)
-->

## Quick Start

```bash
git clone https://github.com/zexy2/Nexus.git
cd Nexus
pnpm install
cp .env.example .env.local   # add your API keys here
docker-compose up -d         # postgres, temporal, jaeger
pnpm db:push
pnpm dev
```

Open [localhost:3000](http://localhost:3000)

## Requirements

- Node 20+
- pnpm
- Docker
- Gemini or OpenAI API key

## Layout

```
apps/web/           → Next.js app (frontend + API routes)
packages/agents/    → LangGraph agent implementations
packages/database/  → Drizzle ORM schema
packages/workflows/ → Temporal workflow definitions
```

## Scripts

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm test         # run tests
pnpm lint         # eslint
pnpm db:push      # push schema to database
pnpm db:studio    # open drizzle studio
```

## Gotchas

- **First run?** Make sure Docker is running before `pnpm dev`
- **Database errors?** Run `pnpm db:push` to sync the schema
- **Temporal not connecting?** Check `docker-compose ps` — temporal takes ~30s to start
- **pgvector missing?** The init script enables it, but check `scripts/init-db.sql` if issues persist
- **AI features not working?** You need at least one of `GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env.local`

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind · PostgreSQL · pgvector · Drizzle · BetterAuth · LangGraph · Temporal · Turborepo

## Docs

- [API Reference](docs/API.md)
- [Architecture Decisions](docs/adr/)

## License

MIT
