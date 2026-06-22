# ADR-001: Local-first data boundaries

## Status

**Superseded for v1.** The original January 2026 Zero Sync decision was not implemented as a production Zero deployment.

## Current decision

- Lists and metadata use an IndexedDB cache plus authenticated REST pull/push endpoints.
- PostgreSQL `LISTEN/NOTIFY` emits invalidation signals so clients can pull earlier than the polling fallback.
- Document bodies use Yjs CRDT updates and PostgreSQL snapshots.
- Tasks, approvals, change proposals, and agent reviews remain server transactions with audit records.

## Rationale

CRDT merging is appropriate for concurrent document text, but not for operations that must preserve business invariants such as approving a task change or accepting a coding-agent submission. This boundary keeps offline responsiveness without pretending that the whole product is conflict-free.

## Consequences

- The product must not claim full Zero Sync or fully offline operation.
- Offline mutations can be retried, but the server remains authoritative.
- A collaboration outage makes document editing read-only instead of silently overwriting newer content.
