import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import {
  enforceAiBudget,
  writeAuditLog,
} from "@/lib/production-guardrails";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { agentExecutions } from "@nexus/database/schema";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { runAgent } from "@/lib/ai/agent";

export const runtime = "nodejs";

type CommandExecutionOutput = {
  agentsUsed: string[];
  documentsCreated: string[];
  tasksCreated: string[];
  output: string;
  duration: number;
};

function commandStatusWhere(commandId: string, userId: string) {
  return and(
    sql`${agentExecutions.input}->>'commandId' = ${commandId}`,
    sql`${agentExecutions.input}->>'userId' = ${userId}`
  );
}

function toWireStatus(status: string): "processing" | "completed" | "failed" {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "processing";
}

/**
 * POST /api/commands/process
 * Process a natural language command through Ask Nexus.
 */
export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.commands,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aiBudget = await enforceAiBudget({
    userId: protection.user.id,
    email: protection.user.email,
    kind: "chat",
  });
  if (!aiBudget.ok) return aiBudget.response;

  try {
    const body = await request.json();
    const {
      commandId,
      command,
      workspaceId,
      priority = "normal",
      metadata = {},
    } = body as {
      commandId?: unknown;
      command?: unknown;
      workspaceId?: unknown;
      priority?: unknown;
      metadata?: unknown;
    };

    if (typeof commandId !== "string" || typeof command !== "string" || !command.trim()) {
      return NextResponse.json(
        { error: "commandId and command are required" },
        { status: 400 }
      );
    }

    const access = await requireWorkspaceAccess(
      protection.user.id,
      typeof workspaceId === "string" ? workspaceId : undefined
    );
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await db
      .select()
      .from(agentExecutions)
      .where(commandStatusWhere(commandId, protection.user.id))
      .orderBy(desc(agentExecutions.createdAt))
      .limit(1);

    if (existing[0]?.status === "running" || existing[0]?.status === "pending") {
      return NextResponse.json({
        success: true,
        commandId,
        executionId: existing[0].id,
        status: toWireStatus(existing[0].status),
        message: "Command processing already started",
      });
    }

    const [execution] = await db
      .insert(agentExecutions)
      .values({
        workspaceId: access.workspaceId,
        agentType: "supervisor",
        status: "running",
        input: {
          commandId,
          command,
          userId: protection.user.id,
          priority,
          metadata,
        },
        temporalWorkflowId: `cmd-${commandId}`.slice(0, 255),
        startedAt: new Date(),
      })
      .returning();

    if (!execution) {
      return NextResponse.json(
        { error: "Failed to create command execution" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      userId: protection.user.id,
      workspaceId: access.workspaceId,
      event: "command.start",
      request,
      metadata: { commandId, executionId: execution.id },
    });

    void processCommandAsync({
      executionId: execution.id,
      commandId,
      command,
      workspaceId: access.workspaceId,
      userId: protection.user.id,
    });

    return NextResponse.json({
      success: true,
      commandId,
      executionId: execution.id,
      status: "processing",
      message: "Command processing started",
    });
  } catch (error) {
    console.error("Command process error:", error);
    return NextResponse.json(
      { error: "Failed to process command" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/commands/status?id=xxx
 * Get status of a command owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.commands,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const commandId = searchParams.get("id");

    if (!commandId) {
      return NextResponse.json(
        { error: "id parameter is required" },
        { status: 400 }
      );
    }

    const [execution] = await db
      .select()
      .from(agentExecutions)
      .where(commandStatusWhere(commandId, protection.user.id))
      .orderBy(desc(agentExecutions.createdAt))
      .limit(1);

    if (!execution) {
      return NextResponse.json(
        { error: "Command not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: toWireStatus(execution.status),
      result: execution.output,
      error: execution.errorMessage || undefined,
      startedAt: execution.startedAt?.getTime() ?? execution.createdAt.getTime(),
      executionId: execution.id,
    });
  } catch (error) {
    console.error("Command status error:", error);
    return NextResponse.json(
      { error: "Failed to get command status" },
      { status: 500 }
    );
  }
}

async function processCommandAsync(input: {
  executionId: string;
  commandId: string;
  command: string;
  workspaceId: string;
  userId: string;
}) {
  const startTime = Date.now();

  try {
    const { model } = await getUserModelConfig(input.userId);
    const result = await runAgent({
      model,
      messages: [{ role: "user", content: input.command }],
      context: { userId: input.userId, workspaceId: input.workspaceId },
      maxSteps: 6,
    });

    const output: CommandExecutionOutput = {
      agentsUsed: result.toolsUsed,
      documentsCreated: result.createdDocs.map((document) => document.id),
      tasksCreated: result.createdTasks.map((task) => task.id),
      output: result.text || "Command processed successfully.",
      duration: Date.now() - startTime,
    };

    await db
      .update(agentExecutions)
      .set({
        status: "completed",
        output: output as Record<string, unknown>,
        completedAt: new Date(),
      })
      .where(eq(agentExecutions.id, input.executionId));

    await writeAuditLog({
      userId: input.userId,
      workspaceId: input.workspaceId,
      event: "command.complete",
      metadata: { commandId: input.commandId, executionId: input.executionId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Command ${input.commandId} failed:`, error);

    await db
      .update(agentExecutions)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(eq(agentExecutions.id, input.executionId));

    await writeAuditLog({
      userId: input.userId,
      workspaceId: input.workspaceId,
      event: "command.fail",
      status: "failed",
      metadata: {
        commandId: input.commandId,
        executionId: input.executionId,
        error: message,
      },
    });
  }
}
