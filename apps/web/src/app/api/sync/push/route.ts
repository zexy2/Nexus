/**
 * Sync Push API - Receives mutations from clients
 * 
 * This endpoint handles the server-side of local-first sync:
 * - Receives pending mutations from offline clients
 * - Validates and applies changes to the database
 * - Returns success/failure for each mutation
 * 
 * Protected: Requires authentication
 * Rate Limited: 60 requests per minute
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import {
  chatMessages,
  agentJobs,
  docs,
  tasks,
  workspaceMembers,
  workspaces,
} from "@nexus/database/schema";

interface PendingMutation {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  data: Record<string, unknown>;
  timestamp: number;
}

// Table mapping for type-safe operations
const tableMap = {
  docs,
  tasks,
  workspaces,
  chat_messages: chatMessages,
} as const;

type ValidTable = keyof typeof tableMap;

function isValidTable(table: string): table is ValidTable {
  return table in tableMap;
}

export async function POST(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.sync,
  });
  
  if (!protection.success) {
    return protection.response;
  }

  try {
    const userId = protection.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const mutation: PendingMutation = await request.json();
    const { table, operation, data } = mutation;

    // Validate table name
    if (!isValidTable(table)) {
      return NextResponse.json(
        { error: `Unknown table: ${table}` },
        { status: 400 }
      );
    }

    // Convert data keys to snake_case
    const preparedData = prepareDataForDb(data);
    const access = await authorizeMutation(table, operation, preparedData, userId);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason },
        { status: access.status }
      );
    }

    const authorizedData = access.data || preparedData;

    switch (operation) {
      case "insert":
        await handleInsert(table, authorizedData);
        break;

      case "update":
        if (!authorizedData.id) {
          return NextResponse.json(
            { error: "Update requires id" },
            { status: 400 }
          );
        }
        await handleUpdate(table, authorizedData);
        break;

      case "delete":
        if (!authorizedData.id) {
          return NextResponse.json(
            { error: "Delete requires id" },
            { status: 400 }
          );
        }
        await handleDelete(table, authorizedData.id as string);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      mutationId: mutation.id,
    });
  } catch (error) {
    console.error("[Sync Push] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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

async function authorizeMutation(
  table: ValidTable,
  operation: PendingMutation["operation"],
  data: Record<string, unknown>,
  userId: string
): Promise<
  | { allowed: true; data?: Record<string, unknown> }
  | { allowed: false; status: number; reason: string }
> {
  if (operation === "insert" && table === "workspaces") {
    return { allowed: true, data: { ...data, ownerId: userId } };
  }

  const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(userId);

  if (table === "tasks" && data.status === "in_review") {
    return { allowed: false, status: 409, reason: "Only a coding-agent submission can move a task into review" };
  }
  if (table === "tasks" && operation === "update" && data.status === "done" && typeof data.id === "string") {
    const pendingReview = await db.query.agentJobs.findFirst({
      where: and(
        eq(agentJobs.taskId, data.id),
        inArray(agentJobs.status, ["submitted", "outdated"])
      ),
    });
    if (pendingReview) {
      return { allowed: false, status: 409, reason: "Review the submitted pull request before completing this task" };
    }
  }

  if (table === "workspaces") {
    const id = data.id as string | undefined;
    if (!id) {
      return { allowed: false, status: 400, reason: `${operation} requires workspace id` };
    }

    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, userId)))
      .limit(1);

    if (!workspace) {
      return { allowed: false, status: 403, reason: "Workspace access denied" };
    }

    const nextData = { ...data };
    delete nextData.ownerId;
    return { allowed: true, data: nextData };
  }

  if (operation === "insert") {
    const workspaceId = data.workspaceId as string | undefined;
    if (!workspaceId || !accessibleWorkspaceIds.includes(workspaceId)) {
      return { allowed: false, status: 403, reason: "Workspace access denied" };
    }

    // Inserts are upserts (onConflictDoUpdate on id). A client-supplied id that
    // already belongs to a record in another workspace would let this "insert"
    // overwrite a different tenant's row. Reject when the id is already taken by
    // a workspace the caller cannot access.
    const insertId = data.id as string | undefined;
    if (insertId) {
      const existingWorkspaceId = await findRecordWorkspaceId(table, insertId);
      if (existingWorkspaceId && !accessibleWorkspaceIds.includes(existingWorkspaceId)) {
        return { allowed: false, status: 403, reason: "Record access denied" };
      }
    }

    return { allowed: true };
  }

  const id = data.id as string | undefined;
  if (!id) {
    return { allowed: false, status: 400, reason: `${operation} requires id` };
  }

  const existingWorkspaceId = await findRecordWorkspaceId(table, id);
  if (!existingWorkspaceId || !accessibleWorkspaceIds.includes(existingWorkspaceId)) {
    return { allowed: false, status: 403, reason: "Record access denied" };
  }

  const nextWorkspaceId = data.workspaceId as string | undefined;
  if (nextWorkspaceId && !accessibleWorkspaceIds.includes(nextWorkspaceId)) {
    return { allowed: false, status: 403, reason: "Workspace access denied" };
  }

  return { allowed: true };
}

async function findRecordWorkspaceId(table: Exclude<ValidTable, "workspaces">, id: string) {
  switch (table) {
    case "docs": {
      const [row] = await db.select({ workspaceId: docs.workspaceId }).from(docs).where(eq(docs.id, id)).limit(1);
      return row?.workspaceId;
    }
    case "tasks": {
      const [row] = await db.select({ workspaceId: tasks.workspaceId }).from(tasks).where(eq(tasks.id, id)).limit(1);
      return row?.workspaceId;
    }
    case "chat_messages": {
      const [row] = await db
        .select({ workspaceId: chatMessages.workspaceId })
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);
      return row?.workspaceId;
    }
  }
}

async function handleInsert(table: ValidTable, data: Record<string, unknown>) {
  const schemaTable = tableMap[table];
  
  // Use Drizzle's insert with onConflictDoUpdate for upsert
  await db.insert(schemaTable).values(data as never).onConflictDoUpdate({
    target: (schemaTable as typeof docs).id,
    set: data as never,
  });
}

async function handleUpdate(table: ValidTable, data: Record<string, unknown>) {
  const schemaTable = tableMap[table];
  const id = data.id as string;
  const updateData = { ...data };
  delete updateData.id;
  
  await db.update(schemaTable)
    .set(updateData as never)
    .where(eq((schemaTable as typeof docs).id, id));
}

async function handleDelete(table: ValidTable, id: string) {
  const schemaTable = tableMap[table];

  if (table === "tasks") {
    await db
      .update(tasks)
      .set({ isArchived: 1, updatedAt: new Date() })
      .where(eq(tasks.id, id));
    return;
  }
  
  await db.delete(schemaTable)
    .where(eq((schemaTable as typeof docs).id, id));
}

function prepareDataForDb(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Drizzle uses camelCase in JS but maps to snake_case in DB automatically
  // So we need to KEEP camelCase for Drizzle, only convert timestamps
  
  for (const [key, value] of Object.entries(data)) {
    // Convert timestamp numbers to Date objects for date fields
    if (
      (key === "createdAt" || key === "updatedAt" || key === "startedAt" ||
       key === "completedAt" || key === "dueDate" || key === "joinedAt") &&
      typeof value === "number"
    ) {
      result[key] = new Date(value);
    } else if (key === "isArchived" && typeof value === "boolean") {
      // docs.is_archived is an integer column (0/1) for sync compatibility, but
      // the client models it as a boolean. Coerce so the insert/update doesn't
      // fail with "column is of type integer but expression is of type boolean".
      result[key] = value ? 1 : 0;
    } else {
      result[key] = value;
    }
  }

  return result;
}
