# Project Status

- **Last updated:** August 2026
- **Positioning:** Portfolio demo, not full SaaS
- **Primary promise:** Change the plan once. Nexus keeps the work aligned.

## Current Product State

| Area                  | Status                          | Notes                                                                |
| --------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Living Plans          | Implemented                     | Plans can be analyzed into stable requirements such as `REQ-001`.    |
| Plan impact review    | Implemented                     | Change sets and proposals are persisted for user review.             |
| Human approval        | Implemented                     | Proposed work changes are applied only after approval.               |
| Kanban work alignment | Implemented                     | Tasks expose requirement links and alignment/orphaned states.        |
| Workflow history      | Implemented                     | Temporal-backed runs are persisted and reconciled.                   |
| Audit trail           | Implemented                     | Critical workflow and change events are logged.                      |
| Demo auth             | Implemented                     | Isolated expiring sessions; public signup disabled in demo mode.     |
| AI provider           | Implemented with env dependency | Gemini is server-managed; missing keys return controlled 503 states. |
| Rate limits           | Implemented                     | Atomic Postgres-backed global, user, and action quotas.               |
| Collaboration         | Implemented                     | Yjs updates and snapshots persist through a custom WebSocket service.|
| Embeddings/RAG        | Optional                        | pgvector when configured; scoped keyword fallback otherwise.         |
| Coding-agent handoff  | Implemented                     | MCP brief, PR/test evidence, stale-context guard, human review.       |
| MCP PR verification   | Implemented on current branch   | GitHub App verifies repository, open state, base branch, and remote head SHA before submission is persisted. |
| GitHub integration    | Implemented with env dependency | GitHub App sync, impact links, approved writes, webhook refresh.     |
| Linear integration    | Implemented with env dependency | OAuth, team/project sync, approved writes; credentials required.     |
| External writes       | Implemented                     | Temporal retries approved writes and records terminal outcomes.      |
| Zero production cache | Deferred                        | v1 uses API-backed sync/offline queue behavior.                      |

## Demo Readiness

The app is ready to run locally with `pnpm dev:local` and is structured for Docker VPS deployment.

Public demo is considered ready only when all of these are true:

- Domain or VPS public IP is reachable from the internet.
- HTTPS/reverse proxy is configured for the web app and collaboration websocket.
- `GEMINI_API_KEY` is set.
- `/api/health` reports healthy database, Temporal, worker heartbeat, and configured AI provider.
- `pnpm smoke:prod` completes document generation, task breakdown, and Living Plan impact analysis.
- `pnpm smoke:integrations` passes after GitHub App and Linear OAuth environment values are configured.
- Demo login creates a separate expiring identity and workspace without exposing a password.
- The workflow center shows a read-only completed Codex run backed by a merged PR.
- The seeded proof points to merged GitHub PR #33 and its matching merge commit.
- A real Codex MCP run created PR #39 and reached human-approved task completion; repository/head verification is included in merged main commit `889c84b`.
- Claude Code and Cursor are protocol-compatible clients, but have not had independent end-to-end smoke runs recorded yet.

## Main User Flow

```text
Demo login
  -> create or open a plan
  -> run Living Plan analysis
  -> review extracted requirements
  -> approve selected work proposals
  -> inspect Kanban links/alignment
  -> edit the plan
  -> run impact review
  -> inspect workflow history and audit trail
```

## Engineering Notes

- Production deploys must use `pnpm db:migrate`; `db:push` is local-only.
- AI endpoints should not return mock success when the provider is unavailable.
- Workflow failures should be visible in both run history and audit logs.
- Tasks should be archived rather than hard-deleted when change proposals remove work.
- BYOK is intentionally not part of the normal user flow for this demo.

## Architecture Decisions

See [ADR documentation](adr/) for detailed decisions. ADR-001 is historical context; the current demo uses API-backed sync/offline queue behavior while production Zero cache remains deferred.

- [001 - Local-First Architecture](adr/001-local-first-architecture.md)
- [002 - AI Orchestration Boundary (Superseded)](adr/002-multi-agent-langgraph.md)
- [003 - Durable Execution](adr/003-durable-execution-temporal.md)
- [004 - Observability](adr/004-observability-opentelemetry.md)
