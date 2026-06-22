# ADR-002: AI orchestration and coding-agent boundary

## Status

**Superseded.** The experimental LangGraph supervisor package was removed in June 2026.

## Current decision

- Interactive chat and command processing use the Vercel AI SDK tool-calling loop.
- Durable plan generation, task extraction, and impact review use Temporal workflows.
- External coding agents are not hosted by Nexus. Codex, Claude Code, or Cursor claim immutable briefs over MCP and work in the user's local repository.
- Task mutation and coding-agent acceptance require explicit human review.

## Rationale

The original named-agent graph added dependencies and visual complexity without improving the core Living Plan guarantee. The current architecture separates three concerns: model tool use, durable business workflows, and external code execution.

## Consequences

- UI copy describes outcomes and evidence rather than simulated agent personalities.
- Web research is reported only when Tavily supplied real sources.
- Coding-agent submissions cannot mark work done automatically.
