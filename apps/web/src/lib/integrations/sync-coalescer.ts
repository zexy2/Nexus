/**
 * Coalesces bursts of sync requests for the same integration within this
 * process: at most one sync runs per integration, and at most one more is
 * queued behind it. Every request that arrives while a sync is queued (not yet
 * started) shares that queued run, which by construction starts after the
 * request arrived and therefore observes its change.
 */
type ChainState<R> = {
  tail: Promise<unknown>;
  pending: Promise<R> | null;
};

const chains = new Map<string, ChainState<unknown>>();

const noop = () => undefined;

export function scheduleCoalesced<R>(key: string, run: () => Promise<R>): Promise<R> {
  let state = chains.get(key) as ChainState<R> | undefined;
  if (!state) {
    state = { tail: Promise.resolve(), pending: null };
    chains.set(key, state as ChainState<unknown>);
  }
  if (state.pending) return state.pending;

  const current = state;
  const scheduled: Promise<R> = current.tail.then(noop, noop).then(() => {
    // Once this run starts, later requests must queue a fresh run.
    if (current.pending === scheduled) current.pending = null;
    return run();
  });
  current.pending = scheduled;
  current.tail = scheduled;

  const cleanup = () => {
    if (current.tail === scheduled && chains.get(key) === current) chains.delete(key);
  };
  scheduled.then(cleanup, cleanup);
  return scheduled;
}

/** Test helper. */
export function resetCoalescedSchedules() {
  chains.clear();
}
