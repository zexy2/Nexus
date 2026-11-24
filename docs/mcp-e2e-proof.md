# MCP End-to-End Handoff Proof

This file was created by the MCP end-to-end verification run. Pull request #39, which added it, is the artifact that run produced.

## What was exercised

A local Codex CLI client connected to the Nexus MCP endpoint (`POST /api/mcp`) with a scoped agent token and completed one coding-agent job:

1. `list_available_jobs` / `claim_job` - claimed the job dispatched with **Send to agent**.
2. `get_job_context` - read the immutable, versioned task brief.
3. `report_progress` - streamed progress events to the job timeline.
4. Implemented the change and opened this PR with the user's own `gh` session.
5. `submit_result` - submitted the PR URL, commit SHA, test results, and acceptance-criteria evidence.
6. Nexus verified the PR through the connected GitHub App (repository, PR number and URL, open state, base branch, current remote head SHA) before persisting the submission and moving the task to `in_review`.
7. A human approved the task, moving it to `done`.

## Where it is referenced

- `docs/STATUS.md` (Demo Readiness) and the README verification scope.
- `apps/web/src/__tests__/unit/agent-handoff.real.test.ts` uses this PR's metadata as the fixture for GitHub PR verification.

Claude Code and Cursor use the same MCP endpoint and tool contract but have not been independently smoke-tested. See `docs/API.md` for the full tool list and submission rules.
