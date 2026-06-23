import { NextRequest, NextResponse } from "next/server";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ensureDefaultWorkspace, getAccessibleWorkspaceIds, requireWorkspaceAccess } from "@/lib/workspace-auth";
import { agentExecutions } from "@nexus/database/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { enforceAiBudget, writeAuditLog } from "@/lib/production-guardrails";
import {
  extractWorkflowSteps,
  reconcileRunningWorkflowExecutions,
  reconcileWorkflowExecution,
} from "@/lib/workflow-reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

type PublicWorkflowType =
  | "document"
  | "research"
  | "tasks"
  | "task"
  | "code"
  | "document_generation"
  | "task_breakdown"
  | "code_generation"
  | "plan_impact";

type WorkflowRequest = {
  workflowType?: PublicWorkflowType;
  type?: PublicWorkflowType;
  input?: Record<string, unknown>;
  workspaceId?: string;
};

type WorkflowStarter = (
  workflowType: string,
  input: Record<string, unknown>,
  options?: { workflowId?: string; taskQueue?: string }
) => Promise<{ workflowId: string; runId: string; status?: string }>;

let startWorkflow: WorkflowStarter | null = null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

async function initTemporal() {
  if (startWorkflow) return true;

  try {
    const temporalClient = await import("@nexus/workflows/client");
    await temporalClient.createTemporalClient();
    startWorkflow = temporalClient.startWorkflow as WorkflowStarter;
    return true;
  } catch (error) {
    console.error("[Workflows] Temporal unavailable:", getErrorMessage(error));
    startWorkflow = null;
    return false;
  }
}

function normalizeWorkflowType(type: PublicWorkflowType | undefined) {
  switch (type) {
    case "document":
    case "document_generation":
      return {
        publicType: "document",
        temporalName: "documentGenerationWorkflow",
        agentType: "writer" as const,
      };
    case "research":
      return {
        publicType: "research",
        temporalName: "researchWorkflow",
        agentType: "researcher" as const,
      };
    case "tasks":
    case "task":
    case "task_breakdown":
      return {
        publicType: "tasks",
        temporalName: "taskBreakdownWorkflow",
        agentType: "project_manager" as const,
      };
    case "code":
    case "code_generation":
      return {
        publicType: "code",
        temporalName: "codeGenerationWorkflow",
        agentType: "coder" as const,
      };
    case "plan_impact":
      return {
        publicType: "plan_impact",
        temporalName: "planImpactWorkflow",
        agentType: "project_manager" as const,
      };
    default:
      return null;
  }
}

function buildTemporalInput(
  workflowType: string,
  input: Record<string, unknown>,
  workspaceId: string,
  userId: string
) {
  const title = deriveWorkflowTitle(input);

  if (workflowType === "document") {
    return {
      workspaceId,
      userId,
      title,
      prompt: String(input.prompt || input.topic || input.title || ""),
      style: typeof input.style === "string" ? input.style : "formal",
    };
  }

  if (workflowType === "tasks") {
    return {
      workspaceId,
      userId,
      docId: typeof input.docId === "string" ? input.docId : undefined,
      projectDescription: String(input.projectDescription || input.goal || input.prompt || ""),
    };
  }

  if (workflowType === "plan_impact") {
    return {
      workspaceId,
      userId,
      docId: String(input.docId || ""),
    };
  }

  if (workflowType === "research") {
    return {
      workspaceId,
      userId,
      query: String(input.query || input.prompt || ""),
      depth: input.depth === "deep" ? "deep" : "standard",
      sources: Array.isArray(input.sources) ? input.sources : ["documents", "web"],
    };
  }

  return {
    workspaceId,
    userId,
    specification: String(input.specification || input.task || input.prompt || ""),
    language: typeof input.language === "string" ? input.language : "typescript",
    framework: typeof input.framework === "string" ? input.framework : undefined,
    includeTests: Boolean(input.includeTests),
  };
}

function deriveWorkflowTitle(input: Record<string, unknown>) {
  const explicitTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (explicitTitle) return explicitTitle.slice(0, 120);

  const source = [input.prompt, input.topic, input.goal, input.projectDescription]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();

  if (!source) return "Untitled Plan";

  const cleaned = source
    .replace(/[#*_`>~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned;
  return firstSentence.length > 90
    ? `${firstSentence.slice(0, 87).trim()}...`
    : firstSentence;
}

export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.research,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;

  let body: WorkflowRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const workflow = normalizeWorkflowType(body.workflowType || body.type);
  if (!workflow) {
    return NextResponse.json({ error: "Invalid workflow type" }, { status: 400 });
  }

  if (!body.input || Object.keys(body.input).length === 0) {
    return NextResponse.json({ error: "Missing workflow input" }, { status: 400 });
  }
  if (workflow.publicType === "plan_impact" && typeof body.input.docId !== "string") {
    return NextResponse.json({ error: "docId is required for plan impact analysis" }, { status: 400 });
  }
  if (workflow.publicType === "research") {
    const requestedSources = Array.isArray(body.input.sources)
      ? body.input.sources
      : ["documents", "web"];
    const wantsWeb = requestedSources.some((source) => source === "web" || source === "both");
    if (wantsWeb && !process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          error: "TAVILY_NOT_CONFIGURED",
          message: "Web research is not configured on this server. Select workspace documents only.",
          retryable: false,
        },
        { status: 503 }
      );
    }
  }

  const workspaceAccess = await requireWorkspaceAccess(
    userId,
    typeof body.workspaceId === "string" ? body.workspaceId : typeof body.input.workspaceId === "string" ? body.input.workspaceId : null
  );

  if (!workspaceAccess.ok) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: workspaceAccess.status });
  }

  if (!(await initTemporal()) || !startWorkflow) {
    return NextResponse.json(
      { error: "TEMPORAL_UNAVAILABLE", message: "Workflow engine is unavailable" },
      { status: 503 }
    );
  }

  const aiBudget = await enforceAiBudget({
    userId,
    email: protection.user.email,
    kind: "workflow",
  });
  if (!aiBudget.ok) return aiBudget.response;

  const workflowId = `${workflow.publicType}-${crypto.randomUUID()}`;
  const temporalInput = buildTemporalInput(
    workflow.publicType,
    body.input,
    workspaceAccess.workspaceId,
    userId
  );

  const [execution] = await db
    .insert(agentExecutions)
    .values({
      workspaceId: workspaceAccess.workspaceId,
      agentType: workflow.agentType,
      status: "running",
      input: {
        ...body.input,
        workflowType: workflow.publicType,
      },
      temporalWorkflowId: workflowId,
      startedAt: new Date(),
    })
    .returning();

  try {
    const result = await startWorkflow(workflow.temporalName, temporalInput, {
      workflowId,
      taskQueue: "nexus-agents",
    });

    await writeAuditLog({
      userId,
      workspaceId: workspaceAccess.workspaceId,
      event: "workflow.start",
      metadata: {
        workflowId: result.workflowId,
        executionId: execution.id,
        workflowType: workflow.publicType,
      },
      request,
    });

    return NextResponse.json(
      {
        workflowId: result.workflowId,
        executionId: execution.id,
        status: "running",
      },
      { status: 202 }
    );
  } catch (error) {
    const message = getErrorMessage(error);
    await db
      .update(agentExecutions)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(eq(agentExecutions.id, execution.id));

    await writeAuditLog({
      userId,
      workspaceId: workspaceAccess.workspaceId,
      event: "workflow.start_failed",
      status: "failed",
      metadata: {
        workflowId,
        executionId: execution.id,
        workflowType: workflow.publicType,
        message,
      },
      request,
    });

    return NextResponse.json(
      { error: "WORKFLOW_START_FAILED", message, executionId: execution.id },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.workflowStatus,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;

  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflowId");
  const executionId = searchParams.get("executionId");
  const limit = Number(searchParams.get("limit") || 20);

  const workspaceIds = await getAccessibleWorkspaceIds(userId);
  if (workspaceIds.length === 0) {
    await ensureDefaultWorkspace(userId);
    return NextResponse.json([]);
  }

  if (!workflowId && !executionId) {
    const rows = await db
      .select()
      .from(agentExecutions)
      .where(inArray(agentExecutions.workspaceId, workspaceIds))
      .orderBy(desc(agentExecutions.createdAt))
      .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20);

    const reconciledRows = await reconcileRunningWorkflowExecutions(rows, { userId, request });

    return NextResponse.json(reconciledRows);
  }

  const conditions = [inArray(agentExecutions.workspaceId, workspaceIds)];
  if (executionId) conditions.push(eq(agentExecutions.id, executionId));
  if (workflowId) conditions.push(eq(agentExecutions.temporalWorkflowId, workflowId));

  const execution = await db.query.agentExecutions.findFirst({
    where: and(...conditions),
  });

  if (!execution) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const reconciledExecution = await reconcileWorkflowExecution(execution, { userId, request });

  return NextResponse.json({
    workflowId: reconciledExecution.temporalWorkflowId,
    executionId: reconciledExecution.id,
    status: reconciledExecution.status,
    steps: extractWorkflowSteps(reconciledExecution.output),
    result: reconciledExecution.output ?? null,
    error: reconciledExecution.errorMessage ?? null,
  });
}
