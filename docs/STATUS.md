# Project Status

- **Last updated:** 2026-11-23
- **Positioning:** Portfolio demo, not full SaaS
- **Primary promise:** Change the plan once. Nexus keeps the work aligned.

## Current Product State

| Area                  | Status                          | Notes                                                                |
| --------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Living Plans          | Implemented                     | Plans can be analyzed into stable requirements such as `REQ-001`.    |
| Plan impact review    | Implemented                     | Change sets and proposals are persisted for user review.             |
| Human approval        | Implemented                     | Proposed work changes are applied only after approval.               |
| Kanban work alignment | Implemented                     | Tasks expose requirement links and alignment/orphaned states.        |
| Workflow history      | Implemented, tested             | Temporal-backed runs are persisted and reconciled; leases, idempotency receipts and worker drain are covered by tests. |
| Audit trail           | Implemented                     | Critical workflow and change events are logged.                      |
| Demo auth             | Implemented                     | Isolated expiring sessions; public signup disabled in demo mode.     |
| AI provider           | Implemented with env dependency | Gemini is server-managed; missing keys return controlled 503 states. |
| Rate limits           | Implemented, tested             | Atomic Postgres-backed global, user, and action quotas. Default global AI caps (25/day, 2/min) are low; see follow-ups. |
| Collaboration         | Implemented                     | Yjs updates and snapshots persist through a custom WebSocket service; tokens refresh and offline edits sync on reconnect. |
| Offline sync          | Implemented, tested             | Non-blocking mutation queue, field-level conflict handling, per-user storage. No UI yet for rejected mutations. |
| API routes            | Implemented, tested             | Every `apps/web/src/app/api/**/route.ts` is imported by at least one test file (66 of 66). |
| Embeddings/RAG        | Optional                        | pgvector when configured; scoped keyword fallback otherwise.         |
| Coding-agent handoff  | Implemented                     | MCP brief, PR/test evidence, stale-context guard, human review.       |
| MCP PR verification   | Implemented                     | GitHub App verifies repository, open state, base branch, and remote head SHA before submission is persisted. |
| GitHub integration    | Implemented with env dependency | GitHub App sync, impact links, approved writes, webhook refresh.     |
| Linear integration    | Implemented with env dependency | OAuth, team/project sync, approved writes; credentials required.     |
| External writes       | Implemented                     | Temporal retries approved writes and records terminal outcomes.      |
| Zero production cache | Deferred                        | v1 uses API-backed sync/offline queue behavior.                      |
| Saga / compensation   | Not implemented                 | ADR-003 describes it; workflows use lease/reclaim and finalize steps instead. |
| OpenTelemetry         | Optional, web only              | Enabled with `OTEL_ENABLED=true`; the Temporal worker is not instrumented. |

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

## Reliability & security hardening (phases 0-4)

Delivered as stacked PRs #46 (phase 0) -> #48 (phase 1) -> #50 (phase 2) -> #51 (phase 3) -> phase 4 (tests, coverage, infra pinning, docs). They are not on `main` until the stack is merged.

- **Dependency upgrades:** Next 16.4.6, better-auth 1.7.27, BlockNote 0.57, zod 4.
- **Sync/push hardening and OAuth:** hardened sync and push paths; OAuth state binding for the GitHub/Linear callbacks.
- **Workflow durability:** leases with reclaim, non-retryable error classification, Temporal worker drain on shutdown (`WORKER_SHUTDOWN_GRACE_TIME`), and idempotency receipts for external writes and activities. Receipts older than `RECEIPT_RETENTION_DAYS` (default 30) are removed by `scripts/maintenance-db-cleanup.sh`, scheduled by `scripts/install-vps-maintenance.sh` (re-run it on the VPS).
- **Race guards:** guards added to the code paths that previously raced (phase 1).
- **Offline sync engine:** non-blocking queue, field-level conflicts, per-user storage.
- **Collaboration:** collab token refresh and offline editing.
- **Infra:** Temporal images pinned (auto-setup 1.29.7, ui 2.58.1), multi-target Dockerfile (`web` Next.js standalone, `worker`, `collaboration` single bundle, `migrate`) with a web `HEALTHCHECK`, collab service has its own healthcheck, worker container healthcheck disabled (it has no HTTP endpoint; liveness is the DB heartbeat in `/api/health`).
- **CI:** CodeQL, `pnpm audit`, secret scanning and Dependabot are added in PR #49 (not part of this stack), and coverage runs in CI from phase 4.

### Tests and coverage

- `@nexus/web`: 74 test files, 621 tests (includes a test for GitHub private key decoding added in phase 4).
- `@nexus/workflows`: 3 test files, 35 tests (new in phase 4; also fixed a parser bug).
- All 66 API route handlers are imported by at least one test (30 were untested before phase 4).
- Coverage (`pnpm test:coverage`, v8):

| Package           | Lines  | Branches | Functions |
| ----------------- | ------ | -------- | --------- |
| `@nexus/web`      | 40.53% | 34.51%   | 28.18%    |
| `@nexus/workflows`| 5.99%  | 4.82%    | 10.00%    |

Route coverage (import-level) is complete, but line coverage is still moderate. The workflows number is low because only workflow definitions, parsing and worker lifecycle are unit-tested there, not the activities.

### Known limitations and follow-ups

- No UI for rejected offline mutations.
- `pnpm audit --prod` reports 13 moderate/low advisories (11 moderate, 2 low; none high or critical), mostly OpenTelemetry instrumentation packages plus `@ai-sdk/provider-utils`, `glob` and `minimatch`.
- AI limit defaults (all env-overridable, see `docs/DEPLOYMENT.md`): global safety cap 5000/day and 120/min; regular user 200/day and 20/min (workflows 50/day, chat 200/day); admin 400/day and 40/min; demo unchanged (3/day, 1/min).
- ADR-003 Saga/compensation is not implemented.
- OpenTelemetry is not wired into the worker.

## Architecture Decisions

See [ADR documentation](adr/) for detailed decisions. ADR-001 is historical context; the current demo uses API-backed sync/offline queue behavior while production Zero cache remains deferred.

- [001 - Local-First Architecture](adr/001-local-first-architecture.md)
- [002 - AI Orchestration Boundary (Superseded)](adr/002-multi-agent-langgraph.md)
- [003 - Durable Execution](adr/003-durable-execution-temporal.md)
- [004 - Observability](adr/004-observability-opentelemetry.md)
