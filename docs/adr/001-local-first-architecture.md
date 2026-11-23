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

## Offline queue guarantees

- The push queue is ordered. 4xx answers are permanent: the mutation moves to the browser's rejected store and the queue continues. 401/408/425/429, network errors and 5xx are transient: the queue waits with backoff.
- A mutation that keeps getting 5xx while the pull in the same cycle succeeds (server healthy, payload-specific failure) is parked in the rejected store with reason `server_error` after 8 strikes, or 3 strikes spread over 30 minutes. Outages never park anything. Tradeoff: later mutations then run without it, so a dependent change may be rejected too; retrying oldest-first restores the order.
- The server never answers 500 for a payload PostgreSQL cannot store: NUL characters and lone surrogates are stripped, NUL in ids is a 400, other data exceptions are 422 `INVALID_DATA`, constraint violations 409 `CONSTRAINT_VIOLATION`.
- Rejected mutations are listed in the shell's sync-issues panel (Retry re-queues, Discard deletes). Sign-out counts unsynced changes, rejected mutations and unsent offline AI commands separately before deleting local data.
- Pull never sends server-only columns (the doc `embedding` vector).
