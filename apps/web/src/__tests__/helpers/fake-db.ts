/**
 * Minimal in-memory stand-in for the drizzle `db` used by route tests that
 * need real state transitions (guarded UPDATE ... WHERE status IN (...)).
 *
 * WHERE clauses are rendered with drizzle's PgDialect and evaluated against
 * the stored rows. Only conjunctions of `col = $n` and `col in ($n, ...)` are
 * supported; anything else throws, so a test can never pass because the fake
 * silently ignored a predicate. Tables listed in `uniquePartial` enforce a
 * partial unique index and throw a drizzle-shaped 23505 error on violation.
 * `transaction` snapshots state and restores it if the callback throws.
 */
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

const dialect = new PgDialect();

function camel(snake: string) {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function compileWhere(where: SQL | undefined): (row: Row) => boolean {
  if (!where) return () => true;
  const { sql, params } = dialect.sqlToQuery(where);
  const stripped = sql.replace(/^\(|\)$/g, "");
  const parts = stripped.split(" and ");
  const checks = parts.map((part) => {
    const eqMatch = part.match(/^"\w+"\."(\w+)" = \$(\d+)$/);
    if (eqMatch) {
      const column = camel(eqMatch[1]!);
      const value = params[Number(eqMatch[2]) - 1];
      return (row: Row) => row[column] === value;
    }
    const inMatch = part.match(/^"\w+"\."(\w+)" in \(((?:\$\d+(?:, )?)+)\)$/);
    if (inMatch) {
      const column = camel(inMatch[1]!);
      const values = inMatch[2]!.split(", ").map((ref) => params[Number(ref.slice(1)) - 1]);
      return (row: Row) => values.includes(row[column]);
    }
    throw new Error(`fake-db: unsupported WHERE fragment: ${part} (full: ${sql})`);
  });
  return (row) => checks.every((check) => check(row));
}

export type UniquePartialIndex = {
  name: string;
  column: string;
  whenStatusIn: string[];
};

export function createFakeDb(options: { uniquePartial?: Record<string, UniquePartialIndex> } = {}) {
  let state: Record<string, Row[]> = {};
  const hooks: { afterFindFirst?: (table: string, row: Row | undefined) => void } = {};

  let txQueue: Promise<void> = Promise.resolve();
  const rows = (table: string) => (state[table] ??= []);

  function enforceUnique(table: string, candidate: Row, ignoreId?: unknown) {
    const index = options.uniquePartial?.[table];
    if (!index || !index.whenStatusIn.includes(candidate.status as string)) return;
    const clash = rows(table).some(
      (row) =>
        row.id !== ignoreId &&
        row[index.column] === candidate[index.column] &&
        index.whenStatusIn.includes(row.status as string)
    );
    if (clash) {
      const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        constraint_name: index.name,
      });
      throw Object.assign(new Error("Failed query"), { cause: pgError });
    }
  }

  function project(row: Row, selection?: Record<string, unknown>) {
    if (!selection) return { ...row };
    const out: Row = {};
    for (const [key, column] of Object.entries(selection)) {
      const name = (column as { name?: string }).name;
      out[key] = name ? row[camel(name)] : undefined;
    }
    return out;
  }

  function queryTable(tableKey: string) {
    // db.query.<camelTableKey>
    const table = tableKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    return {
      findFirst: async (args: { where?: SQL; orderBy?: unknown } = {}) => {
        const match = compileWhere(args.where);
        let found = rows(table).filter(match);
        if (table === "agent_job_submissions") {
          found = [...found].sort((a, b) => Number(b.revision) - Number(a.revision));
        }
        const row = found[0] ? { ...found[0] } : undefined;
        hooks.afterFindFirst?.(table, row);
        return row;
      },
      findMany: async (args: { where?: SQL } = {}) => rows(table).filter(compileWhere(args.where)).map((row) => ({ ...row })),
    };
  }

  const db = {
    query: new Proxy({} as Record<string, ReturnType<typeof queryTable>>, {
      get: (_target, prop: string) => queryTable(prop),
    }),
    insert(tableRef: Parameters<typeof getTableName>[0]) {
      const table = getTableName(tableRef);
      return {
        values(values: Row | Row[]) {
          const list = Array.isArray(values) ? values : [values];
          const run = () =>
            list.map((value) => {
              const row: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
              // Apply literal column defaults from the real schema (e.g. status).
              for (const column of getTableConfig(tableRef as PgTable).columns) {
                const fallback = column.default as unknown;
                const isSql = !!fallback && typeof fallback === "object" && "queryChunks" in (fallback as object);
                if (fallback !== undefined && !isSql) row[camel(column.name)] = structuredClone(fallback);
              }
              Object.assign(row, value);
              enforceUnique(table, row);
              rows(table).push(row);
              return row;
            });
          return {
            returning: async (selection?: Record<string, unknown>) => run().map((row) => project(row, selection)),
            then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
              try {
                run();
                return Promise.resolve(undefined).then(resolve, reject);
              } catch (error) {
                return Promise.reject(error).then(resolve, reject);
              }
            },
          };
        },
      };
    },
    update(tableRef: Parameters<typeof getTableName>[0]) {
      const table = getTableName(tableRef);
      return {
        set(values: Row) {
          return {
            where(where: SQL) {
              const run = () => {
                const match = compileWhere(where);
                const updated: Row[] = [];
                for (const row of rows(table)) {
                  if (!match(row)) continue;
                  const next = { ...row, ...values };
                  enforceUnique(table, next, row.id);
                  Object.assign(row, values);
                  updated.push(row);
                }
                return updated;
              };
              return {
                returning: async (selection?: Record<string, unknown>) => run().map((row) => project(row, selection)),
                then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
                  try {
                    run();
                    return Promise.resolve(undefined).then(resolve, reject);
                  } catch (error) {
                    return Promise.reject(error).then(resolve, reject);
                  }
                },
              };
            },
          };
        },
      };
    },
    /** Generic select chain; resolves to `selectResult` (configure per test). */
    select() {
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit"]) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(fake.selectResult()).then(resolve, reject);
      return chain;
    },
    // Transactions are serialized, approximating the row locks Postgres takes
    // on UPDATE: a concurrent transaction touching the same row waits for the
    // first to commit and then re-evaluates its WHERE against the new state.
    async transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      const previous = txQueue;
      let release!: () => void;
      txQueue = new Promise<void>((resolve) => (release = resolve));
      await previous;
      const snapshot = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        state = snapshot;
        throw error;
      } finally {
        release();
      }
    },
  };

  const fake = {
    db,
    hooks,
    rows,
    seed(table: string, row: Row) {
      rows(table).push({ createdAt: new Date(), updatedAt: new Date(), ...row });
    },
    selectResult: (): unknown[] => [],
    reset() {
      state = {};
      hooks.afterFindFirst = undefined;
      fake.selectResult = () => [];
    },
  };
  return fake;
}

/** Shared instance for vi.mock("@/lib/db"); enforces the real partial index. */
export const sharedFake = createFakeDb({
  uniquePartial: {
    agent_jobs: {
      name: "agent_jobs_task_active_idx",
      column: "taskId",
      whenStatusIn: ["queued", "claimed", "running", "submitted"],
    },
  },
});
