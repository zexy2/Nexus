import { getDb, type Database as DbType } from "@nexus/database";
// Re-export drizzle operators from the same source as schema to avoid version conflicts
export { eq, desc, asc, and, or, gte, lte, like, sql, inArray, isNull, isNotNull } from "drizzle-orm";

// Database instance with full schema (includes relations).
//
// Resolved lazily: getDb() only runs when a property of `db` is first accessed,
// not when this module is imported. This keeps `next build`'s static route
// analysis (which imports the module but runs no queries) from throwing when
// DATABASE_URL is absent — the connection is created on first real use.
type Db = ReturnType<typeof getDb>;
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb(process.env.DATABASE_URL);
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Db;

export type Database = DbType;

// Re-export schema items for convenience
export * from "@nexus/database";
