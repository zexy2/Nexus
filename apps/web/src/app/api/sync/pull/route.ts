/**
 * Sync Pull API - Returns changes since last sync
 * 
 * This endpoint provides incremental sync:
 * - Returns all records modified since the given timestamp
 * - Enables offline-first clients to catch up after reconnecting
 * 
 * Protected: Requires authentication
 * Rate Limited: 60 requests per minute
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";

export async function GET(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.sync,
  });
  
  if (!protection.success) {
    return protection.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const since = parseInt(searchParams.get("since") || "0", 10);
    const sinceDate = new Date(since).toISOString();

    // Fetch all tables with changes since the given timestamp using raw SQL
    const [
      docsResult,
      tasksResult,
      workspacesResult,
      chatMessagesResult,
      agentExecutionsResult,
    ] = await Promise.all([
      db.execute(sql`SELECT * FROM docs WHERE updated_at >= ${sinceDate}::timestamp`),
      db.execute(sql`SELECT * FROM tasks WHERE updated_at >= ${sinceDate}::timestamp`),
      db.execute(sql`SELECT * FROM workspaces WHERE updated_at >= ${sinceDate}::timestamp`),
      db.execute(sql`SELECT * FROM chat_messages WHERE created_at >= ${sinceDate}::timestamp`),
      db.execute(sql`SELECT * FROM agent_executions WHERE created_at >= ${sinceDate}::timestamp`),
    ]);
    
    // Extract rows from query results (drizzle returns array directly)
    const docsData = docsResult as unknown[];
    const tasksData = tasksResult as unknown[];
    const workspacesData = workspacesResult as unknown[];
    const chatMessagesData = chatMessagesResult as unknown[];
    const agentExecutionsData = agentExecutionsResult as unknown[];

    // Convert to client format (snake_case to camelCase, dates to timestamps)
    const result = {
      docs: docsData.map(toClientFormat),
      tasks: tasksData.map(toClientFormat),
      workspaces: workspacesData.map(toClientFormat),
      chatMessages: chatMessagesData.map(toClientFormat),
      agentExecutions: agentExecutionsData.map(toClientFormat),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Sync Pull] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function toClientFormat(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    // Convert snake_case to camelCase
    const clientKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    
    // Convert Date objects to timestamps
    if (value instanceof Date) {
      result[clientKey] = value.getTime();
    } else {
      result[clientKey] = value;
    }
  }

  return result;
}
