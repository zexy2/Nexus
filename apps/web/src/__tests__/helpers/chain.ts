/**
 * Chainable, awaitable query-builder stub for route tests.
 *
 * `chain(result)` returns an object whose builder methods (from, where,
 * orderBy, limit, leftJoin, innerJoin, set, values, onConflictDoUpdate,
 * returning) all return the same object, and which resolves to `result`
 * when awaited. Use it to stub `db.select()...`, `db.update()...` etc.
 */
export function chain(result: unknown): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of [
    "from", "where", "orderBy", "limit", "leftJoin", "innerJoin",
    "set", "values", "onConflictDoUpdate", "returning",
  ]) {
    b[m] = () => b;
  }
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}
