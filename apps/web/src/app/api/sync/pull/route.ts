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
import { and, gte, inArray, or, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import {
  agentExecutions,
  chatMessages,
  docs,
  tasks,
  workspaceMembers,
  workspaces,
} from "@nexus/database/schema";

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
    const userId = protection.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const since = parseInt(searchParams.get("since") || "0", 10);
    const sinceDate = new Date(Number.isFinite(since) ? since : 0);

    const accessibleWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId)));

    const workspaceIds = accessibleWorkspaces.map((workspace) => workspace.id);

    if (workspaceIds.length === 0) {
      return NextResponse.json({
        docs: [],
        tasks: [],
        workspaces: [],
        chatMessages: [],
        agentExecutions: [],
        lastSync: Date.now(),
      });
    }

    const [
      docsData,
      tasksData,
      workspacesData,
      chatMessagesData,
      agentExecutionsData,
    ] = await Promise.all([
      db
        .select()
        .from(docs)
        .where(and(inArray(docs.workspaceId, workspaceIds), gte(docs.updatedAt, sinceDate))),
      db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.workspaceId, workspaceIds), gte(tasks.updatedAt, sinceDate))),
      db
        .select()
        .from(workspaces)
        .where(and(inArray(workspaces.id, workspaceIds), gte(workspaces.updatedAt, sinceDate))),
      db
        .select()
        .from(chatMessages)
        .where(and(inArray(chatMessages.workspaceId, workspaceIds), gte(chatMessages.createdAt, sinceDate))),
      db
        .select()
        .from(agentExecutions)
        .where(and(inArray(agentExecutions.workspaceId, workspaceIds), gte(agentExecutions.createdAt, sinceDate))),
    ]);

    // Convert to client format (snake_case to camelCase, dates to timestamps)
    const result = {
      docs: docsData.map(toClientFormat),
      tasks: tasksData.map(toClientFormat),
      workspaces: workspacesData.map(toClientFormat),
      chatMessages: chatMessagesData.map(toClientFormat),
      agentExecutions: agentExecutionsData.map(toClientFormat),
      lastSync: Date.now(),
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
