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
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { docs, tasks, workspaces, chatMessages, agentExecutions } from "@nexus/database/schema";

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
  agent_executions: agentExecutions,
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

    switch (operation) {
      case "insert":
        await handleInsert(table, preparedData);
        break;

      case "update":
        if (!preparedData.id) {
          return NextResponse.json(
            { error: "Update requires id" },
            { status: 400 }
          );
        }
        await handleUpdate(table, preparedData);
        break;

      case "delete":
        if (!preparedData.id) {
          return NextResponse.json(
            { error: "Delete requires id" },
            { status: 400 }
          );
        }
        await handleDelete(table, preparedData.id as string);
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
    } else {
      result[key] = value;
    }
  }

  return result;
}
