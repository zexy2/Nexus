import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "packages/database/drizzle");
const sql = postgres(databaseUrl, { max: 1 });

async function tableExists(name) {
  const [row] = await sql`
    select to_regclass(${`public.${name}`}) is not null as exists
  `;
  return row.exists;
}

async function columnExists(tableName, columnName) {
  const [row] = await sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `;
  return row.exists;
}

async function main() {
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const [history] = await sql`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `;
  if (history.count > 0) {
    console.log("[db] Drizzle migration history already exists.");
    return;
  }

  if (!(await tableExists("docs"))) {
    console.log("[db] Fresh database detected; migrations will start at 0000.");
    return;
  }

  const requiredTables = [
    "tasks",
    "plan_versions",
    "requirements",
    "requirement_task_links",
    "change_sets",
    "change_proposals",
  ];
  const missingTables = [];
  for (const tableName of requiredTables) {
    if (!(await tableExists(tableName))) missingTables.push(tableName);
  }

  const requiredColumns = [
    ["tasks", "alignment_status"],
    ["tasks", "alignment_updated_at"],
    ["tasks", "is_archived"],
  ];
  const missingColumns = [];
  for (const [tableName, columnName] of requiredColumns) {
    if (!(await columnExists(tableName, columnName))) {
      missingColumns.push(`${tableName}.${columnName}`);
    }
  }

  if (missingTables.length > 0 || missingColumns.length > 0) {
    throw new Error(
      `Existing schema cannot be safely baselined. Missing tables: ${
        missingTables.join(", ") || "none"
      }. Missing columns: ${missingColumns.join(", ") || "none"}.`
    );
  }

  const hasSnapshots = await tableExists("document_yjs_snapshots");
  const hasUpdates = await tableExists("document_yjs_updates");
  if (hasSnapshots !== hasUpdates) {
    throw new Error(
      "Partial Yjs schema detected. Both persistence tables must exist or both must be absent."
    );
  }

  const journal = JSON.parse(
    await readFile(path.join(migrationsDir, "meta/_journal.json"), "utf8")
  );
  const targetIndex = hasSnapshots ? 4 : 3;
  const target = journal.entries.find((entry) => entry.idx === targetIndex);
  if (!target) {
    throw new Error(`Migration journal entry ${targetIndex} was not found`);
  }

  const migrationSql = await readFile(
    path.join(migrationsDir, `${target.tag}.sql`),
    "utf8"
  );
  const hash = createHash("sha256").update(migrationSql).digest("hex");

  await sql`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${hash}, ${target.when})
  `;
  console.log(`[db] Baselined existing schema through ${target.tag}.`);
}

try {
  await main();
} finally {
  await sql.end();
}
