# Nexus Product Requirements

## 1. Summary

Nexus is a public portfolio demo for an AI-assisted workflow workspace.

The product is not "AI generates a document and a task list." That is easy to reproduce in ChatGPT. The real product claim is:

> Change the plan once. Nexus keeps the work aligned.

Nexus stores the plan, extracts stable requirements, links them to delivery tasks, detects what changed, proposes work updates, and applies only the changes approved by the user.

The next SaaS wedge is GitHub + Linear impact review: when a plan changes, Nexus should show affected requirements, Linear issues, GitHub PRs, test/check evidence, and coding-agent jobs before any external system is updated.

## 2. Target Audience

Primary reviewers:

- Recruiters evaluating a real full-stack product demo.
- Technical leads evaluating product thinking and implementation depth.
- Small-team founders who understand the pain of stale project plans and disconnected task boards.

Primary user in-product:

- A solo builder, product lead, or small software team member who wants to keep a project plan and Kanban board aligned after scope changes.

## 3. Problem

Project plans change, but delivery work often stays stale.

Common failure modes:

- A requirement changes but the task board is not updated.
- New requirements have no tasks.
- Removed requirements leave orphaned tasks behind.
- AI produces plausible text, but no durable link exists between plan, tasks, and decisions.
- Teams cannot inspect why a task was created or changed.

## 4. Positioning

Nexus is a change-control layer for AI-assisted planning.

It is not:

- A Jira/Linear replacement.
- A generic multi-agent chat product.
- A full SaaS with public signup and billing.
- A tool where AI can silently rewrite the task board.

It is:

- A controlled public demo.
- A Living Plan workspace.
- A human-approved impact review system.
- A proof that AI output can become auditable product data.

## 5. Product Principles

- Plans are versioned artifacts, not disposable chat responses.
- Requirements have stable IDs such as `REQ-001`.
- Tasks should link back to requirements.
- AI proposes changes; users approve mutations.
- Failed or unavailable AI should be explicit, not hidden behind mock output.
- Workflow history is part of the product, not a debug screen.
- Demo AI spend must be bounded with server-side quotas.

## 6. Core Objects

| Object                | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| Document / Plan       | Editable source plan content.                                   |
| Plan version          | Immutable snapshot used for comparison.                         |
| Requirement           | Stable requirement extracted from a plan version.               |
| Task                  | Kanban work item.                                               |
| Requirement-task link | Relationship between scope and delivery work.                   |
| Change set            | Impact analysis result for a plan change.                       |
| Change proposal       | Suggested task/link/archive action awaiting approval.           |
| Workspace integration | GitHub/Linear connection metadata and sync status.               |
| External issue        | Synced Linear/GitHub issue representation.                       |
| External PR/check     | Synced GitHub pull request and CI evidence.                      |
| Impact graph edge     | Relationship between plan, requirement, issue, PR, check, job.   |
| Workflow run          | Durable execution record with status, steps, output, and error. |
| Audit log             | Record of critical user/system actions.                         |

## 7. Main User Flow

### 7.1 First plan

1. User signs in with the demo account.
2. User creates or generates a project plan.
3. User runs Living Plan analysis.
4. Nexus extracts requirements.
5. Nexus proposes initial tasks.
6. User approves selected proposals.
7. Approved tasks appear on the Kanban board with requirement links.

### 7.2 Plan change

1. User edits the plan.
2. User runs impact analysis.
3. Nexus compares the new plan with the previous accepted version.
4. Nexus classifies added, modified, removed, and unchanged requirements.
5. Nexus identifies impacted, orphaned, and missing work.
6. Nexus creates proposals.
7. User applies selected proposals or rejects the change set.
8. Kanban and workflow history update accordingly.

## 8. Functional Requirements

### 8.1 Living Plans

| ID    | Requirement                                                     | Priority |
| ----- | --------------------------------------------------------------- | -------- |
| LP-01 | Users can create and edit project plans.                        | P0       |
| LP-02 | Users can create immutable plan versions from document content. | P0       |
| LP-03 | AI extracts stable requirement IDs from a plan.                 | P0       |
| LP-04 | Requirements show coverage and linked task count.               | P0       |
| LP-05 | Users can inspect accepted and pending requirement states.      | P1       |

### 8.2 Change Impact Review

| ID    | Requirement                                                            | Priority |
| ----- | ---------------------------------------------------------------------- | -------- |
| CH-01 | Users can trigger impact analysis for a changed plan.                  | P0       |
| CH-02 | Nexus classifies added, modified, removed, and unchanged requirements. | P0       |
| CH-03 | Nexus identifies affected tasks and orphaned work.                     | P0       |
| CH-04 | Nexus creates proposals without mutating tasks immediately.            | P0       |
| CH-05 | Users can apply selected proposals.                                    | P0       |
| CH-06 | Users can reject a change set without changing data.                   | P0       |

### 8.3 Kanban Work

| ID    | Requirement                                                                | Priority |
| ----- | -------------------------------------------------------------------------- | -------- |
| WK-01 | Users can view tasks in Todo, In Progress, and Done columns.               | P0       |
| WK-02 | Users can drag tasks between columns.                                      | P0       |
| WK-03 | Tasks show requirement links where available.                              | P0       |
| WK-04 | Tasks expose alignment states such as aligned, needs review, and orphaned. | P0       |
| WK-05 | Tasks are archived rather than hard-deleted by generated proposals.        | P1       |

### 8.4 Workflow History

| ID    | Requirement                                                         | Priority |
| ----- | ------------------------------------------------------------------- | -------- |
| RN-01 | Workflow runs persist status, steps, result, error, and timing.     | P0       |
| RN-02 | Running workflows reconcile with Temporal before being shown.       | P0       |
| RN-03 | Failed workflows are visible and include controlled error messages. | P0       |
| RN-04 | Completed impact workflows create pending change sets.              | P0       |

### 8.5 AI and Demo Safety

| ID    | Requirement                                                    | Priority |
| ----- | -------------------------------------------------------------- | -------- |
| AI-01 | Normal users do not enter provider API keys in v1.             | P0       |
| AI-02 | Server-managed Gemini is the primary provider.                 | P0       |
| AI-03 | Missing provider config returns `503 AI_PROVIDER_UNAVAILABLE`. | P0       |
| AI-04 | Daily and per-minute limits return `429 RATE_LIMIT_EXCEEDED`.  | P0       |
| AI-05 | AI output parsers fail safely instead of inventing tasks.      | P0       |

### 8.6 Authentication and Demo Entry

| ID    | Requirement                                              | Priority |
| ----- | -------------------------------------------------------- | -------- |
| AU-01 | Public signup is disabled in demo mode.                  | P0       |
| AU-02 | Demo login creates a server-side session.                | P0       |
| AU-03 | Demo passwords are never bundled into client JavaScript. | P0       |
| AU-04 | Optional demo access code can limit casual public usage. | P1       |

### 8.7 GitHub / Linear Impact Graph

| ID    | Requirement                                                                 | Priority |
| ----- | --------------------------------------------------------------------------- | -------- |
| IG-01 | Workspaces can store GitHub and Linear integration metadata and sync status. | P0       |
| IG-02 | Demo workspaces show isolated sample external issues, PRs, and checks.      | P0       |
| IG-03 | The plan detail view shows requirement-to-issue/PR/check evidence.          | P0       |
| IG-04 | Demo users cannot connect real GitHub or Linear accounts.                   | P0       |
| IG-05 | Missing provider config returns explicit unavailable/not-implemented states. | P0       |
| IG-06 | Webhook endpoints verify signatures before accepting events.                | P0       |
| IG-07 | Approved future proposals may update Linear/GitHub only after user review.  | P1       |

## 9. Non-Functional Requirements

| Area          | Requirement                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| Reliability   | No fake success fallback for AI, Temporal, or database failures.             |
| Security      | Secrets live in environment variables, not the database or client bundle.    |
| Authorization | Workspace-scoped endpoints must check ownership or membership.               |
| Observability | Health checks expose database, Temporal, AI provider, and worker heartbeat.  |
| Cost control  | Demo AI usage is bounded by global and per-user quotas.                      |
| Deployment    | Docker VPS deployment must be reproducible with migrations and smoke checks. |

## 10. Public Demo Acceptance Criteria

The demo is acceptable for a CV link when:

1. A reviewer can open the public URL.
2. Demo login works without manual setup.
3. The reviewer can create or open a plan.
4. Living Plan analysis extracts requirements.
5. The reviewer can approve proposals and see tasks appear on Kanban.
6. Editing the plan and running impact review produces a new change set.
7. Workflow history shows the relevant run statuses and steps.
8. The plan detail view shows the impact graph with isolated sample issue/PR/check evidence.
9. `/api/health` reports healthy database, Temporal, worker heartbeat, AI provider, and integration configuration state.
10. Quota and unavailable states are clear instead of silent failures.

## 11. Known Constraints

- This is a portfolio demo, not production SaaS.
- Public signup stays disabled until email verification, captcha, and stronger abuse controls exist.
- BYOK is deferred; it may be useful later, but it weakens the current demo story if added too early.
- OpenAI embeddings and Tavily search are optional.
- Production Zero cache is deferred; API-backed sync and offline queue behavior are used in v1.
- Oracle/VPS deployment requires cloud ingress, HTTPS, and provider secrets before the public demo is fully ready.
- GitHub/Linear is a guarded vertical slice with real GitHub App / Linear OAuth callbacks, provider sync adapters, isolated demo data, impact graph APIs, settings configuration, signed webhook refresh, and Temporal-backed approved external writes.

## 12. Future Options

Potential next steps after the core demo is stable:

- Targeted webhook-driven incremental sync workers.
- Broader external write coverage beyond approved issue comments/issue updates.
- Approved external proposal execution for issue comments, labels, and descriptions.
- Provider selection and BYOK for advanced/admin users.
- Better requirement matching with embeddings.
- Commenting and review discussions on change proposals.
- Email notifications for pending impact reviews.
- Multi-workspace roles and member invitations.

## 13. Last Updated

June 2026
