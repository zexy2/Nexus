# Nexus

> Local-First, Multi-Agent AI Orchestration Platform

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Overview

Nexus is a full-stack productivity platform that combines three modern architectural paradigms:

- **Local-First Architecture** — Instant UI with optimistic updates, offline support, and sync
- **Multi-Agent AI** — Autonomous agent orchestration using LangGraph for complex task execution
- **Durable Execution** — Fault-tolerant workflows with Temporal.io

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  React UI   │  │  IndexedDB  │  │  WebSocket  │              │
│  │  (Next.js)  │  │  (Offline)  │  │   (Sync)    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
┌─────────┼────────────────┼────────────────┼─────────────────────┐
│         ▼                ▼                ▼     API Layer       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Next.js API Routes + BetterAuth            │    │
│  └─────────────────────────┬───────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                             ▼        Service Layer              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  LangGraph   │  │   Temporal   │  │   Drizzle    │          │
│  │   Agents     │  │  Workflows   │  │     ORM      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                             ▼        Data Layer                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           PostgreSQL + pgvector (Embeddings)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15, React 19, Tailwind CSS | App Router, Server Components |
| Database | PostgreSQL 16, pgvector, Drizzle ORM | Relational data + vector search |
| Auth | BetterAuth | Session management, OAuth providers |
| AI | LangGraph, Gemini, OpenAI | Multi-agent orchestration |
| Workflows | Temporal.io | Durable execution, saga patterns |
| Monorepo | Turborepo, pnpm | Build optimization |

## Project Structure

```
nexus/
├── apps/
│   └── web/                 # Next.js application
│       ├── src/
│       │   ├── app/         # App Router pages & API routes
│       │   ├── components/  # React components
│       │   ├── hooks/       # Custom React hooks
│       │   └── lib/         # Utilities & configurations
│       └── e2e/             # Playwright tests
├── packages/
│   ├── agents/              # LangGraph agent implementations
│   ├── database/            # Drizzle schema & migrations
│   ├── workflows/           # Temporal workflow definitions
│   └── zero-schema/         # Sync engine schema
├── docs/
│   ├── adr/                 # Architecture Decision Records
│   ├── API.md               # API documentation
│   └── PRD.md               # Product requirements
└── scripts/                 # Database & utility scripts
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)

### Installation

```bash
# Clone the repository
git clone https://github.com/zexy2/Nexus.git
cd Nexus

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local

# Start infrastructure (PostgreSQL, Temporal, Jaeger)
docker-compose up -d

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

### Environment Variables

See [.env.example](.env.example) for required configuration. Key variables:

```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
BETTER_AUTH_SECRET=...

# AI Provider (at least one required)
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

## Features

### Document Editor
- Rich text editing with TipTap
- AI-assisted writing (streaming)
- Real-time collaboration
- Offline support with auto-sync

### Task Management
- Kanban board with drag-and-drop
- Priority and assignment tracking
- Agent-assisted task breakdown

### AI Agents
- **Supervisor** — Routes tasks to specialized agents
- **Research** — Web search and information gathering
- **Writer** — Content generation and editing
- **Coder** — Code generation and analysis
- **Task** — Task decomposition and planning

### Workflows
- Durable multi-step execution
- Automatic retry and compensation
- Human-in-the-loop approvals

## Documentation

- [Architecture Decision Records](docs/adr/)
- [API Documentation](docs/API.md)
- [Product Requirements](docs/PRD.md)

## Development

```bash
# Run tests
pnpm test

# Run linting
pnpm lint

# Type checking
pnpm type-check

# Build for production
pnpm build
```

## License

MIT
