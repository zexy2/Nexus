/**
 * Sync Push API - Receives mutations from clients
 *
 * This endpoint handles the server-side of local-first sync:
 * - Receives pending mutations from offline clients (lib/sync/zero.tsx)
 * - Validates, authorizes and applies changes to the database
 * - Returns success/failure for each mutation
 *
 * Security model:
 * - Every table has an allowlist of client-writable columns. Anything else the
 *   client sends (the client echoes full pulled rows back on update, so this
 *   includes ownerId, createdBy, embedding, alignmentStatus, timestamps, ...) is
 *   silently dropped and server-owned fields are forced server-side.
 * - "insert" is never a blind upsert. If the id already exists the mutation is
 *   routed through the full update authorization path (same workspace checks,
 *   same business rules such as the PR-review gate) or rejected.
 * - Foreign ids (docId, parentId, executionId, assigneeId) must point into the
 *   same workspace as the row being written.
 * - Deletes are soft (archive) for docs/tasks; other tables cannot be deleted.
 * - Rejections are written to the audit log. When the caller can still read the
 *   row, the rejection body carries `current` (the server row in client format)
 *   so the client can replace its optimistic copy instead of guessing.
 *
 * Conflict strategy (docs/tasks updates):
 * - New clients send only the changed fields in `data` plus
 *   `base: { updatedAt, fields }`, where `base.fields` holds the value each
 *   changed field had in the client's cache when the edit was made.
 * - Under a row lock, every changed field is checked three-way: if the server
 *   value still equals the base value (nobody else touched it) or already
 *   equals the new value, the field is applied. Otherwise someone else changed
 *   that same field since the client last saw it, and the whole mutation is
 *   rejected with 409 STALE_BASE (nothing is written) and `current` returned.
 *   Edits to different fields of the same row therefore merge (per-field
 *   last-write-wins); edits to the same field never silently overwrite.
 * - Mutations without `base` (old cached clients that send the whole row) keep
 *   the previous behaviour: allowlisted fields are written as-is.
 *
 * Protected: Requires authentication
 * Rate Limited: 60 requests per minute per IP and per user, plus the shared
 * per-user document/task mutation budget used by the REST routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { toClientFormat } from "@/lib/sync/client-format";
import {
  checkPersistentRateLimit,
  rateLimitResponse,
  writeAuditLog,
} from "@/lib/production-guardrails";
import {
  parseOptionalDueDate,
  parseTaskPriority,
  parseTaskStatus,
  parseTaskTitle,
} from "@/lib/task-validation";
import {
  agentExecutions,
  agentJobs,
  chatMessages,
  docs,
  tasks,
  workspaceMembers,
  workspaces,
} from "@nexus/database/schema";

type Operation = "insert" | "update" | "delete";
type Row = Record<string, unknown>;

interface PendingMutation {
  id?: string;
  table: string;
  operation: Operation;
  data: Row;
  timestamp?: number;
  /** Optional (new clients): cache state the edit was based on. */
  base?: unknown;
}

interface MutationBase {
  updatedAt?: number;
  fields: Row;
}

const VALID_TABLES = ["docs", "tasks", "workspaces", "chat_messages"] as const;
type ValidTable = (typeof VALID_TABLES)[number];
type WorkspaceScopedTable = Exclude<ValidTable, "workspaces">;

const VALID_OPERATIONS = new Set<string>(["insert", "update", "delete"]);
const AGENT_TYPES = new Set<string>(["supervisor", "researcher", "writer", "coder", "project_manager"]);

class MutationRejected extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly workspaceId?: string | null,
    readonly details?: Row
  ) {
    super(message);
  }
}

function reject(
  status: number,
  code: string,
  message: string,
  workspaceId?: string | null,
  details?: Row
): never {
  throw new MutationRejected(status, code, message, workspaceId, details);
}

function isValidTable(table: unknown): table is ValidTable {
  return typeof table === "string" && (VALID_TABLES as readonly string[]).includes(table);
}

function isPlainObject(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  // Auth + per-IP rate limit
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.sync,
  });

  if (!protection.success) {
    return protection.response;
  }

  const userId = protection.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  let mutation: PendingMutation | undefined;
  try {
    // Per-user limit: the IP bucket alone is shared behind NATs and can be
    // spread across IPs by a single account.
    const userLimit = await checkPersistentRateLimit(
      userId,
      `${RATE_LIMITS.sync.keyPrefix}:push:user`,
      RATE_LIMITS.sync.maxRequests,
      RATE_LIMITS.sync.windowMs
    );
    if (!userLimit.allowed) return rateLimitResponse(userLimit);

    try {
      mutation = (await request.json()) as PendingMutation;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isPlainObject(mutation) || !isPlainObject(mutation.data)) {
      return NextResponse.json({ error: "Invalid mutation" }, { status: 400 });
    }

    const { table, operation, data } = mutation;

    let base: MutationBase | undefined;
    if (mutation.base !== undefined && mutation.base !== null) {
      if (!isPlainObject(mutation.base) || !isPlainObject(mutation.base.fields)) {
        return NextResponse.json({ error: "Invalid mutation base" }, { status: 400 });
      }
      const baseUpdatedAt = mutation.base.updatedAt;
      base = {
        fields: mutation.base.fields,
        updatedAt: typeof baseUpdatedAt === "number" ? baseUpdatedAt : undefined,
      };
    }

    if (!isValidTable(table)) {
      return NextResponse.json(
        { error: `Unknown table: ${String(table)}` },
        { status: 400 }
      );
    }

    if (!VALID_OPERATIONS.has(operation)) {
      return NextResponse.json(
        { error: `Unknown operation: ${String(operation)}` },
        { status: 400 }
      );
    }

    if (table === "workspaces") {
      await applyWorkspaceMutation(operation, data, userId);
    } else {
      await applyScopedMutation(table, operation, data, userId, base);
    }

    return NextResponse.json({
      success: true,
      mutationId: mutation.id,
    });
  } catch (error) {
    if (error instanceof MutationRejected) {
      await writeAuditLog({
        userId,
        workspaceId: error.workspaceId ?? null,
        event: "sync.push.rejected",
        status: "blocked",
        metadata: {
          mutationId: mutation?.id,
          table: mutation?.table,
          operation: mutation?.operation,
          recordId: isPlainObject(mutation?.data) ? mutation.data.id : undefined,
          code: error.code,
          reason: error.message,
        },
        request,
      });
      const current = await loadCurrentForClient(mutation, userId);
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          mutationId: mutation?.id,
          ...(error.details ?? {}),
          ...(current ? { current } : {}),
        },
        { status: error.status }
      );
    }

    console.error("[Sync Push] Error:", error);
    return NextResponse.json(
      { error: "Failed to apply mutation", code: "SYNC_PUSH_FAILED" },
      { status: 500 }
    );
  }
}

// ==========================================
// WORKSPACES
// ==========================================

async function applyWorkspaceMutation(operation: Operation, data: Row, userId: string) {
  const id = optionalId(data.id, "id");

  if (operation === "delete") {
    reject(405, "DELETE_NOT_ALLOWED", "Workspaces cannot be deleted via sync");
  }

  if (operation === "update" && !id) {
    reject(400, "ID_REQUIRED", "update requires workspace id");
  }

  const [existing] = id
    ? await db
        .select({ id: workspaces.id, ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1)
    : [];

  if (existing) {
    // Both an explicit update and an insert whose id already exists (an
    // offline client retrying a create) must be owner-only updates. An insert
    // can never take over a workspace someone else owns.
    if (existing.ownerId !== userId) {
      reject(403, "WORKSPACE_ACCESS_DENIED", "Workspace access denied", existing.id);
    }
    const updates = pickWorkspaceFields(data);
    if (Object.keys(updates).length === 0) return;
    await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() } as never)
      .where(and(eq(workspaces.id, existing.id), eq(workspaces.ownerId, userId)));
    return;
  }

  if (operation === "update") {
    reject(403, "WORKSPACE_ACCESS_DENIED", "Workspace access denied", id);
  }

  const fields = pickWorkspaceFields(data);
  if (typeof fields.name !== "string" || !fields.name.trim()) {
    reject(400, "INVALID_FIELD", "Workspace name is required");
  }

  const now = new Date();
  const inserted = await db
    .insert(workspaces)
    .values({
      ...fields,
      ...(id ? { id } : {}),
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    } as never)
    .onConflictDoNothing({ target: workspaces.id })
    .returning({ id: workspaces.id });

  if (inserted.length === 0) {
    // Lost a race with another writer for the same id. Never overwrite.
    reject(409, "ID_CONFLICT", "A record with this id already exists", id);
  }
}

function pickWorkspaceFields(data: Row): Row {
  const out: Row = {};
  if ("name" in data && data.name !== null) {
    if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 255) {
      reject(400, "INVALID_FIELD", "Invalid workspace name");
    }
    out.name = data.name.trim();
  }
  copyNullableString(data, out, "description");
  copyNullableString(data, out, "iconUrl");
  return out;
}

// ==========================================
// WORKSPACE-SCOPED TABLES (docs, tasks, chat_messages)
// ==========================================

const scopedTables = {
  docs,
  tasks,
  chat_messages: chatMessages,
} as const;

async function applyScopedMutation(
  table: WorkspaceScopedTable,
  operation: Operation,
  data: Row,
  userId: string,
  base?: MutationBase
) {
  const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(userId);
  const id = optionalId(data.id, "id");

  if (operation !== "insert" && !id) {
    reject(400, "ID_REQUIRED", `${operation} requires id`);
  }

  if (operation === "insert") {
    const workspaceId = optionalId(data.workspaceId, "workspaceId");
    if (!workspaceId || !accessibleWorkspaceIds.includes(workspaceId)) {
      reject(403, "WORKSPACE_ACCESS_DENIED", "Workspace access denied", workspaceId);
    }

    const existing = id ? await findExistingRow(table, id) : undefined;
    if (!existing) {
      await insertNewRow(table, data, workspaceId, userId);
      return;
    }

    // The id is already taken. Treat the insert as an update of that row so
    // it goes through exactly the same authorization and business rules.
    assertRowAccess(existing, accessibleWorkspaceIds);
    if (table === "chat_messages") {
      // Chat messages are immutable; a re-sent insert is an idempotent retry.
      return;
    }
    await updateExistingRow(table, existing, data, base);
    return;
  }

  const existing = await findExistingRow(table, id as string);
  if (!existing) {
    reject(403, "RECORD_ACCESS_DENIED", "Record access denied");
  }
  assertRowAccess(existing, accessibleWorkspaceIds);

  if (operation === "delete") {
    await softDeleteRow(table, existing);
    return;
  }

  if (table === "chat_messages") {
    reject(405, "UPDATE_NOT_ALLOWED", "Chat messages cannot be modified via sync", existing.workspaceId as string);
  }

  await updateExistingRow(table, existing, data, base);
}

function assertRowAccess(existing: Row, accessibleWorkspaceIds: string[]) {
  const workspaceId = existing.workspaceId as string | undefined;
  if (!workspaceId || !accessibleWorkspaceIds.includes(workspaceId)) {
    reject(403, "RECORD_ACCESS_DENIED", "Record access denied", workspaceId);
  }
}

async function getAccessibleWorkspaceIds(userId: string) {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId)));

  return rows.map((row) => row.id);
}

async function findExistingRow(table: WorkspaceScopedTable, id: string): Promise<Row | undefined> {
  switch (table) {
    case "docs": {
      const [row] = await db
        .select({ id: docs.id, workspaceId: docs.workspaceId, parentId: docs.parentId })
        .from(docs)
        .where(eq(docs.id, id))
        .limit(1);
      return row;
    }
    case "tasks": {
      const [row] = await db
        .select({
          id: tasks.id,
          workspaceId: tasks.workspaceId,
          status: tasks.status,
          docId: tasks.docId,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(eq(tasks.id, id))
        .limit(1);
      return row;
    }
    case "chat_messages": {
      const [row] = await db
        .select({ id: chatMessages.id, workspaceId: chatMessages.workspaceId })
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);
      return row;
    }
  }
}

async function insertNewRow(table: WorkspaceScopedTable, data: Row, workspaceId: string, userId: string) {
  const id = optionalId(data.id, "id");
  const now = new Date();
  let values: Row;

  switch (table) {
    case "docs": {
      const fields = pickDocFields(data);
      await assertReferences(table, fields, workspaceId, undefined);
      values = { ...fields, workspaceId, createdBy: userId, createdAt: now, updatedAt: now };
      break;
    }
    case "tasks": {
      const fields = pickTaskFields(data);
      if (typeof fields.title !== "string") {
        reject(400, "INVALID_FIELD", "Task title is required", workspaceId);
      }
      await assertReferences(table, fields, workspaceId, undefined);
      values = {
        ...fields,
        workspaceId,
        createdBy: userId,
        completedAt: fields.status === "done" ? now : null,
        createdAt: now,
        updatedAt: now,
      };
      break;
    }
    case "chat_messages": {
      const fields = pickChatFields(data);
      if (typeof fields.content !== "string") {
        reject(400, "INVALID_FIELD", "Message content is required", workspaceId);
      }
      await assertReferences(table, fields, workspaceId, undefined);
      // Only user-authored messages can come from a client.
      values = { ...fields, workspaceId, role: "user", createdAt: now };
      break;
    }
  }

  if (id) values.id = id;

  const schemaTable = scopedTables[table];
  const inserted = await db
    .insert(schemaTable)
    .values(values as never)
    .onConflictDoNothing({ target: (schemaTable as typeof docs).id })
    .returning({ id: (schemaTable as typeof docs).id });

  if (inserted.length === 0) {
    // Someone created this id between our lookup and the insert. Never
    // overwrite; the client will retry and go through the update path.
    reject(409, "ID_CONFLICT", "A record with this id already exists", workspaceId);
  }
}

async function updateExistingRow(
  table: "docs" | "tasks",
  existing: Row,
  data: Row,
  base?: MutationBase
) {
  if (base) {
    await updateWithBase(table, existing, data, base);
    return;
  }

  // Legacy path (no base): old clients send the whole cached row. Allowlisted
  // fields are written as-is, exactly as before.
  const workspaceId = existing.workspaceId as string;
  const fields = await finalizeUpdateFields(
    table,
    existing,
    table === "docs" ? pickDocFields(data) : pickTaskFields(data),
    db
  );

  if (Object.keys(fields).length === 0) return;

  const schemaTable = table === "docs" ? docs : tasks;
  await db
    .update(schemaTable)
    .set({ ...fields, updatedAt: new Date() } as never)
    .where(and(eq(schemaTable.id, existing.id as string), eq(schemaTable.workspaceId, workspaceId)));
}

type QueryDb = Pick<typeof db, "query">;

/** Reference checks and business rules shared by both update paths. */
async function finalizeUpdateFields(table: "docs" | "tasks", existing: Row, fields: Row, queryDb: QueryDb) {
  const workspaceId = existing.workspaceId as string;
  await assertReferences(table, fields, workspaceId, existing);

  if (table === "tasks" && "status" in fields && fields.status !== existing.status) {
    if (fields.status === "done") {
      const pendingReview = await queryDb.query.agentJobs.findFirst({
        where: and(
          eq(agentJobs.taskId, existing.id as string),
          inArray(agentJobs.status, ["submitted", "outdated"])
        ),
      });
      if (pendingReview) {
        reject(
          409,
          "AGENT_REVIEW_REQUIRED",
          "Review the submitted pull request before completing this task",
          workspaceId
        );
      }
    }
    fields.completedAt = fields.status === "done" ? new Date() : null;
  }
  return fields;
}

/**
 * Field-level conflict-checked update (see the header comment). Runs under a
 * row lock so the check and the write see the same row.
 */
async function updateWithBase(table: "docs" | "tasks", existing: Row, data: Row, base: MutationBase) {
  const workspaceId = existing.workspaceId as string;
  const picked = table === "docs" ? pickDocFields(data) : pickTaskFields(data);
  if (Object.keys(picked).length === 0) return;

  // docs and tasks share the id/workspaceId columns used here; the cast keeps
  // drizzle's overloads happy for the union.
  const schemaTable = (table === "docs" ? docs : tasks) as typeof tasks;

  await db.transaction(async (tx) => {
    const [current] = (await tx
      .select()
      .from(schemaTable)
      .where(and(eq(schemaTable.id, existing.id as string), eq(schemaTable.workspaceId, workspaceId)))
      .limit(1)
      .for("update")) as Row[];
    if (!current) {
      reject(404, "RECORD_NOT_FOUND", "Record no longer exists", workspaceId);
    }

    const conflicts = Object.keys(picked).filter((key) => {
      if (!(key in base.fields)) return false; // no base for this field: plain LWW
      const serverValue = normalizeForCompare(key, current[key]);
      return (
        !sameValue(serverValue, normalizeForCompare(key, base.fields[key])) &&
        !sameValue(serverValue, normalizeForCompare(key, data[key]))
      );
    });
    if (conflicts.length > 0) {
      reject(
        409,
        "STALE_BASE",
        "This record was changed by someone else since you last synced",
        workspaceId,
        { conflicts }
      );
    }

    const fields = await finalizeUpdateFields(table, current, picked, tx);
    if (Object.keys(fields).length === 0) return;
    await tx
      .update(schemaTable)
      .set({ ...fields, updatedAt: new Date() } as never)
      .where(and(eq(schemaTable.id, existing.id as string), eq(schemaTable.workspaceId, workspaceId)));
  });
}

/** Map client and server representations of a value onto one comparable form. */
function normalizeForCompare(key: string, value: unknown): unknown {
  // 0/1 flag columns are NOT NULL DEFAULT 0; a client cache written before a
  // flag existed (e.g. is_favorite) reports it as missing, which means 0.
  if ((key === "isArchived" || key === "isFavorite") && (value === undefined || value === null)) return 0;
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "" && key.endsWith("Id")) return null;
  if (key === "dueDate" && typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : ms;
  }
  return value;
}

/** Structural equality; object key order is ignored (jsonb reorders keys). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bArr = b as unknown[];
    return a.length === bArr.length && a.every((item, i) => sameValue(item, bArr[i]));
  }
  const aRow = a as Row;
  const bRow = b as Row;
  const aKeys = Object.keys(aRow);
  return (
    aKeys.length === Object.keys(bRow).length &&
    aKeys.every((key) => key in bRow && sameValue(aRow[key], bRow[key]))
  );
}

/**
 * The server copy of the mutated row, when the caller may still read it, so a
 * rejected client can replace its optimistic copy. Best effort: any failure
 * just omits it.
 */
async function loadCurrentForClient(mutation: PendingMutation | undefined, userId: string) {
  try {
    if (!mutation || !isPlainObject(mutation.data) || !isValidTable(mutation.table)) return undefined;
    const id = mutation.data.id;
    if (typeof id !== "string" || !id) return undefined;
    const accessible = await getAccessibleWorkspaceIds(userId);
    if (mutation.table === "workspaces") {
      if (!accessible.includes(id)) return undefined;
      const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
      return row ? toClientFormat(row) : undefined;
    }
    const schemaTable = scopedTables[mutation.table] as typeof tasks;
    const [row] = (await db.select().from(schemaTable).where(eq(schemaTable.id, id)).limit(1)) as Row[];
    if (!row || typeof row.workspaceId !== "string" || !accessible.includes(row.workspaceId)) {
      return undefined;
    }
    const clientRow = toClientFormat(row);
    // Embeddings are server-only and large; never ship them to the browser.
    delete clientRow.embedding;
    return clientRow;
  } catch {
    return undefined;
  }
}

async function softDeleteRow(table: WorkspaceScopedTable, existing: Row) {
  const workspaceId = existing.workspaceId as string;
  if (table === "chat_messages") {
    reject(405, "DELETE_NOT_ALLOWED", "Chat messages cannot be deleted via sync", workspaceId);
  }

  const schemaTable = table === "docs" ? docs : tasks;
  await db
    .update(schemaTable)
    .set({ isArchived: 1, updatedAt: new Date() })
    .where(and(eq(schemaTable.id, existing.id as string), eq(schemaTable.workspaceId, workspaceId)));
}

/**
 * Foreign ids must stay inside the row's workspace. On updates only values that
 * actually change are checked, so clients echoing back an unchanged reference
 * (e.g. an assignee who has since left the workspace) are not wedged.
 */
async function assertReferences(
  table: WorkspaceScopedTable,
  fields: Row,
  workspaceId: string,
  existing: Row | undefined
) {
  const changed = (key: string) =>
    typeof fields[key] === "string" && (!existing || fields[key] !== existing[key]);

  if (table === "docs" && changed("parentId")) {
    if (fields.parentId === existing?.id) {
      reject(400, "INVALID_FIELD", "A doc cannot be its own parent", workspaceId);
    }
    const [row] = await db
      .select({ id: docs.id })
      .from(docs)
      .where(and(eq(docs.id, fields.parentId as string), eq(docs.workspaceId, workspaceId)))
      .limit(1);
    if (!row) reject(403, "CROSS_WORKSPACE_REFERENCE", "parentId must reference a doc in the same workspace", workspaceId);
  }

  if (table === "tasks" && changed("docId")) {
    const [row] = await db
      .select({ id: docs.id })
      .from(docs)
      .where(and(eq(docs.id, fields.docId as string), eq(docs.workspaceId, workspaceId)))
      .limit(1);
    if (!row) reject(403, "CROSS_WORKSPACE_REFERENCE", "docId must reference a doc in the same workspace", workspaceId);
  }

  if (table === "tasks" && changed("assigneeId")) {
    const assigneeId = fields.assigneeId as string;
    const [row] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, assigneeId))
      )
      .where(
        and(
          eq(workspaces.id, workspaceId),
          or(eq(workspaces.ownerId, assigneeId), eq(workspaceMembers.userId, assigneeId))
        )
      )
      .limit(1);
    if (!row) reject(403, "CROSS_WORKSPACE_REFERENCE", "assigneeId must be a member of the workspace", workspaceId);
  }

  if (table === "chat_messages" && changed("executionId")) {
    const [row] = await db
      .select({ id: agentExecutions.id })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.id, fields.executionId as string), eq(agentExecutions.workspaceId, workspaceId)))
      .limit(1);
    if (!row) reject(403, "CROSS_WORKSPACE_REFERENCE", "executionId must reference an execution in the same workspace", workspaceId);
  }
}

// ==========================================
// COLUMN ALLOWLISTS
// ==========================================
// Only these columns can ever be written by a client. workspaceId, id,
// createdBy, ownerId, role, timestamps, embeddings, AI flags and alignment
// state are server-owned and never copied from the payload.

function pickDocFields(data: Row): Row {
  const out: Row = {};
  if ("title" in data && data.title !== null) {
    if (typeof data.title !== "string" || data.title.length > 500) {
      reject(400, "INVALID_FIELD", "Doc title must be a string of at most 500 characters");
    }
    out.title = data.title;
  }
  if ("content" in data) out.content = data.content;
  copyNullableId(data, out, "parentId");
  copyNullableString(data, out, "iconEmoji");
  copyNullableString(data, out, "coverUrl");
  copyArchivedFlag(data, out);
  copyIntegerFlag(data, out, "isFavorite");
  return out;
}

function pickTaskFields(data: Row): Row {
  const out: Row = {};
  if ("title" in data && data.title !== null) {
    const title = parseTaskTitle(data.title);
    if (!title) reject(400, "INVALID_FIELD", "Title is required and must be 500 characters or fewer");
    out.title = title;
  }
  copyNullableString(data, out, "description");
  if ("status" in data && data.status !== null) {
    const status = parseTaskStatus(data.status);
    if (!status) reject(400, "INVALID_FIELD", "Invalid task status");
    out.status = status;
  }
  if ("priority" in data && data.priority !== null) {
    const priority = parseTaskPriority(data.priority);
    if (!priority) reject(400, "INVALID_FIELD", "Invalid task priority");
    out.priority = priority;
  }
  copyNullableId(data, out, "docId");
  copyNullableId(data, out, "assigneeId");
  if ("assigneeAgentType" in data) {
    const value = data.assigneeAgentType;
    if (value !== null && (typeof value !== "string" || !AGENT_TYPES.has(value))) {
      reject(400, "INVALID_FIELD", "Invalid assigneeAgentType");
    }
    out.assigneeAgentType = value;
  }
  if ("dueDate" in data) {
    const dueDate = parseOptionalDueDate(data.dueDate);
    if (dueDate === "invalid") reject(400, "INVALID_FIELD", "Invalid due date");
    out.dueDate = dueDate;
  }
  if ("position" in data && data.position !== null) {
    if (typeof data.position !== "number" || !Number.isInteger(data.position)) {
      reject(400, "INVALID_FIELD", "position must be an integer");
    }
    out.position = data.position;
  }
  copyArchivedFlag(data, out);
  return out;
}

function pickChatFields(data: Row): Row {
  const out: Row = {};
  if ("content" in data) out.content = data.content;
  copyNullableId(data, out, "executionId");
  if ("metadata" in data) {
    if (data.metadata !== null && !isPlainObject(data.metadata)) {
      reject(400, "INVALID_FIELD", "metadata must be an object");
    }
    out.metadata = data.metadata;
  }
  return out;
}

function copyNullableString(data: Row, out: Row, key: string) {
  if (!(key in data)) return;
  const value = data[key];
  if (value !== null && typeof value !== "string") {
    reject(400, "INVALID_FIELD", `${key} must be a string`);
  }
  out[key] = value;
}

function copyNullableId(data: Row, out: Row, key: string) {
  if (!(key in data)) return;
  const value = data[key] === "" ? null : data[key];
  if (value !== null && typeof value !== "string") {
    reject(400, "INVALID_FIELD", `${key} must be a string id`);
  }
  out[key] = value;
}

function copyArchivedFlag(data: Row, out: Row) {
  copyIntegerFlag(data, out, "isArchived");
}

function copyIntegerFlag(data: Row, out: Row, key: "isArchived" | "isFavorite") {
  if (!(key in data) || data[key] === null) return;
  const value = data[key];
  // is_archived / is_favorite are integer columns (0/1); the client models
  // them as booleans.
  if (typeof value === "boolean") out[key] = value ? 1 : 0;
  else if (value === 0 || value === 1) out[key] = value;
  else reject(400, "INVALID_FIELD", `${key} must be a boolean`);
}

function optionalId(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 128) {
    reject(400, "INVALID_FIELD", `${key} must be a string id`);
  }
  return value;
}
