import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton pattern for database connection
let db: ReturnType<typeof createDb> | null = null;

function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle(client, { schema });
}

export function getDb(connectionString?: string) {
  if (!db) {
    const connStr =
      connectionString ?? process.env.DATABASE_URL;
    
    if (!connStr) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "Please provide a connection string."
      );
    }

    db = createDb(connStr);
  }
  return db;
}

export type Database = ReturnType<typeof getDb>;

// Re-export everything from schema
export * from "./schema";
