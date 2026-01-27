import { getDb, type Database as DbType } from "@nexus/database";
// Re-export drizzle operators from the same source as schema to avoid version conflicts
export { eq, desc, asc, and, or, gte, lte, like, sql, inArray, isNull, isNotNull } from "drizzle-orm";

// Get the database instance with full schema (includes relations)
export const db = getDb(process.env.DATABASE_URL);

export type Database = DbType;

// Re-export schema items for convenience
export * from "@nexus/database";
