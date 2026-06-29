# Nexus API Reference

Base path: `/api`. Protected routes require a Better Auth session cookie. Every workspace-scoped route verifies owner/member access on the server.

## Response conventions

- `401`: no valid session.
- `403` or `404`: the user cannot access the requested workspace resource.
- `429`: `{ "error": "RATE_LIMIT_EXCEEDED", "limit": 4, "remaining": 0, "resetAt": 0 }`.
- `503`: provider or infrastructure unavailable; no mock success is returned.
- Explicit web research without Tavily returns `TAVILY_NOT_CONFIGURED`.

## Authentication and demo

- `GET|POST /api/auth/*` - Better Auth handlers.
- `GET /api/auth/providers` - returns configured social providers as booleans.
- `POST /api/demo/session` - creates an isolated, expiring demo user and workspace when demo mode is enabled.
- `POST /api/onboarding/bootstrap` - ensures the signed-in user has a default workspace and optional starter data.

Public demo sessions cannot create MCP tokens or change repository settings.

## Plans and documents

- `GET /api/docs` - list accessible plans.
- `POST /api/docs` - create a plan.
- `GET /api/docs/:id` - return metadata and materialized BlockNote content.
- `PATCH /api/docs/:id` - update metadata/materialized content; realtime body edits normally arrive through Yjs.
- `DELETE /api/docs/:id` - archive the plan.
- `GET /api/docs/archived` - list archived plans.
- `GET /api/plans/:docId/living-plan` - current version, requirements, coverage, links, and pending review.
- `POST /api/plans/:docId/analyze-change` - flush current content and start `planImpactWorkflow`.

Plan analysis does not mutate tasks immediately. It creates a persisted review set.

## Change review

- `GET /api/change-sets` - list review sets; accepts `docId`, `status`, and `limit`.
- `GET /api/change-sets/:id` - return requirement diff and proposals.
- `POST /api/change-sets/:id/apply` - body: `{ "selectedProposalIds": ["uuid"] }`.
- `POST /api/change-sets/:id/reject` - reject the entire review set.

Only selected proposals are applied. Removed work is archived rather than silently deleted.

## Tasks and Kanban

- `GET /api/tasks` - list tasks with requirement links, alignment state, and latest agent job.
- `POST /api/tasks` - create a task.
- `GET /api/tasks/:id` - return task and handoff permissions.
- `PATCH /api/tasks/:id` - update title, description, priority, due date, or `todo|in_progress|in_review|done` status.
- `DELETE /api/tasks/:id` - archive/delete according to route policy.
- `POST /api/tasks/:id/agent-jobs` - freeze task context and queue a local coding-agent handoff.

## Temporal workflows

- `POST /api/workflows` - start `document`, `tasks`, `research`, `code`, or `plan_impact`.
- `GET /api/workflows?limit=40` - list persisted execution history.
- `GET /api/workflows/:id` - canonical status response.

Start response:

```json
{ "workflowId": "document-...", "executionId": "uuid", "status": "running" }
```

Status response:

```json
{
  "workflowId": "document-...",
  "executionId": "uuid",
  "status": "running|completed|failed",
  "steps": [],
  "result": null,
  "error": null
}
```

## AI and research

- `POST /api/chat` - authenticated AI SDK tool-calling assistant.
- `POST /api/commands/process` and `GET /api/commands/status?id=...` - offline command queue bridge using the same AI SDK agent.
- `POST /api/research` - optional workspace retrieval plus optional sourced Tavily search.
- `GET /api/research?q=...` - direct Tavily search; requires `TAVILY_API_KEY`.
- `POST /api/research/deep` - streamed multi-query Tavily research; requires Tavily and Gemini.
- `POST /api/embeddings` - index scoped content when an embedding provider is configured.
- `POST /api/embeddings/search` - workspace-scoped semantic search.

Gemini-only planning is model analysis, not sourced web research. Source URLs are returned only when an actual search provider supplied them.

## Coding-agent handoff

- `GET|POST /api/agent-tokens` - list or create hashed, scoped, expiring MCP tokens.
- `DELETE /api/agent-tokens/:id` - revoke a token.
- `GET /api/agent-jobs` - list coding-agent jobs.
- `GET /api/agent-jobs/:id` - job, events, submission, tests, and acceptance evidence.
- `POST /api/agent-jobs/:id/refresh-context` - create a new immutable brief version.
- `POST /api/agent-jobs/:id/review` - body: `{ "decision": "approve|reject", "note": "..." }`.
- `POST /api/agent-jobs/:id/cancel` - cancel an active job.
- `GET|PATCH /api/agent-settings` - one GitHub repository and default branch per workspace.
- `POST /api/mcp` - Streamable HTTP MCP endpoint.

MCP tools: `list_available_jobs`, `claim_job`, `get_job_context`, `report_progress`, `submit_result`, and `report_failure`.

Submission requires a PR URL for the configured repository, commit SHA, test results, and acceptance-criteria evidence. Submission moves the task to `in_review`; only human approval moves it to `done`.

## GitHub / Linear impact graph

- `GET /api/integrations` - list workspace integration status and provider configuration readiness.
- `POST /api/integrations/github/connect` - return a GitHub App install URL when the app environment is configured.
- `GET /api/integrations/github/setup` - GitHub App setup callback; stores installation state and starts user authorization.
- `GET /api/integrations/github/callback` - verifies the installation belongs to the authorized GitHub user, then stores the workspace integration.
- `POST /api/integrations/linear/connect` - return a Linear OAuth URL when the OAuth environment is configured.
- `GET /api/integrations/linear/callback` - exchanges the OAuth code, encrypts the token, stores organization/team metadata.
- `DELETE /api/integrations/:id` - disconnect an integration for workspace owners.
- `GET /api/integrations/:id/resources` - list GitHub repositories or Linear teams/projects for configuration.
- `PATCH /api/integrations/:id/config` - owner-only repo/team/project selection.
- `POST /api/integrations/:id/sync` - sync seeded data, GitHub issues/PRs/checks, or Linear issues.
- `GET /api/external-issues` - list synced/seeded external issues for the workspace.
- `GET /api/external-pull-requests` - list synced/seeded pull requests and checks for the workspace.
- `GET /api/impact-graph?docId=...` - return plan -> requirement -> task -> issue -> PR -> check/job evidence.
- `POST /api/webhooks/github` - verify GitHub webhook signatures, dedupe delivery IDs, and queue the event.
- `POST /api/webhooks/linear` - verify Linear webhook signatures/replay window, dedupe delivery IDs, and queue the event.
- `POST /api/external-write-operations/:id/retry` - owner-only retry for an approved GitHub/Linear write operation.

Public demo sessions receive isolated seeded external-work data and cannot connect real GitHub or Linear accounts. External provider writes are never faked: proposals create queued operations and the operation status records success or failure.

## Collaboration and sync

- `POST /api/collab/token` - short-lived, document-scoped WebSocket token.
- `GET /api/sync/pull` - API-backed local cache refresh.
- `POST /api/sync/push` - validated offline mutations.
- `GET /api/sync/stream` - SSE invalidation signal backed by PostgreSQL `LISTEN/NOTIFY`.

Document body concurrency uses Yjs. Updates and snapshots persist in PostgreSQL. Task/change approval rules remain transactional rather than CRDT-merged.

## Operations

- `GET /api/health` - database, Temporal, worker heartbeat, collaboration persistence, and AI configuration.
- `GET /api/settings` - server AI availability, quota remaining, profile, and agent configuration state; BYOK is false.
- `GET /api/admin/usage` - admin-only usage/audit summary.
- `GET /api/traces` - trace inspection endpoint.
