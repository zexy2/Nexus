# Nexus Web App

This is the Next.js application for Nexus, a portfolio-demo workspace for Living Plans, impact review, Kanban alignment, and workflow history.

## Product Role

The web app proves the main demo loop:

```text
Plan -> Requirements -> Proposed work changes -> Human approval -> Kanban -> Workflow history
```

It should not present Nexus as a generic multi-agent chat app. Chat and agents are secondary surfaces; the main product value is keeping work aligned when a plan changes.

## Main Routes

| Route                 | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `/`                   | Public landing page for the portfolio demo.               |
| `/login`              | Auth and demo entry.                                      |
| `/dashboard`          | Overview of plans, priority work, and shortcuts.          |
| `/dashboard/docs`     | Living Plans list.                                        |
| `/dashboard/docs/:id` | Plan editor, requirements, coverage, and impact analysis. |
| `/dashboard/tasks`    | Kanban board with requirement links and alignment states. |
| `/dashboard/changes`  | Human review queue for pending change sets.               |
| `/dashboard/agents`   | Workflow/run history.                                     |
| `/dashboard/settings` | Server-managed AI status and user preferences.            |

## Relevant API Areas

| Area        | Examples                                                                        |
| ----------- | ------------------------------------------------------------------------------- |
| Plans       | `/api/plans/:docId/living-plan`, `/api/plans/:docId/analyze-change`             |
| Change sets | `/api/change-sets`, `/api/change-sets/:id/apply`, `/api/change-sets/:id/reject` |
| Workflows   | `/api/workflows`, `/api/workflows/:id`, `/api/agents/executions`                |
| Tasks       | `/api/tasks`                                                                    |
| Demo auth   | `/api/demo/session`                                                             |
| Health      | `/api/health`                                                                   |

## Local Development

Run from the repository root:

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev:local
```

`pnpm dev:local` starts the web app, Temporal worker, collaboration server, database, and local demo seed path.

## Environment Notes

- `GEMINI_API_KEY` is required for AI workflows.
- `AI_ENABLED=false` or a missing provider key should produce a controlled unavailable state.
- `PUBLIC_SIGNUP_ENABLED=false` is the expected public demo setting.
- Normal users should not see BYOK/API-key fields.
- `OPENAI_API_KEY` is optional for embeddings/RAG.
- `TAVILY_API_KEY` is optional for web research.

## Quality Checks

```bash
pnpm --filter @nexus/web type-check
pnpm --filter @nexus/web lint
pnpm --filter @nexus/web build
```
