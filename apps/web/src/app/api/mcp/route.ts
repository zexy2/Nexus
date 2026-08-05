import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  agentJobEvents,
  agentJobs,
  agentJobSubmissions,
  tasks,
  workspaceIntegrations,
  workspaceRepositories,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import {
  authenticateAgentToken,
  pullRequestBelongsToRepository,
} from "@/lib/agent-handoff";
import { checkPersistentRateLimit, writeAuditLog } from "@/lib/production-guardrails";
import {
  GitHubVerificationError,
  verifyGitHubPullRequestSubmission,
} from "@/lib/integrations/providers/github-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_MCP_REQUEST_BYTES = 256 * 1024;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const tools = [
  {
    name: "list_available_jobs",
    description: "List coding jobs explicitly dispatched by a Nexus user and available to this workspace token.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "claim_job",
    description: "Atomically claim one queued Nexus coding job for this local agent client.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        clientName: { type: "string", enum: ["codex", "claude-code", "cursor", "other"] },
      },
      required: ["jobId", "clientName"],
      additionalProperties: false,
    },
  },
  {
    name: "get_job_context",
    description: "Read the immutable plan, requirements, acceptance criteria and repository contract for a claimed job.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "report_progress",
    description: "Append a durable progress event to a claimed coding job.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        message: { type: "string", maxLength: 2000 },
        phase: { type: "string", maxLength: 80 },
      },
      required: ["jobId", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_result",
    description: "Submit a GitHub pull request with tests and evidence for every acceptance criterion. Human approval remains required.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        pullRequestUrl: { type: "string" },
        commitSha: { type: "string", minLength: 7, maxLength: 64 },
        summary: { type: "string", minLength: 1, maxLength: 5000 },
        tests: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              command: { type: "string" },
              status: { type: "string", enum: ["passed", "failed", "skipped"] },
              output: { type: "string" },
            },
            required: ["command", "status"],
          },
        },
        acceptanceEvidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              requirementKey: { type: "string" },
              criterion: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["requirementKey", "criterion", "evidence"],
          },
        },
      },
      required: ["jobId", "pullRequestUrl", "commitSha", "summary", "tests", "acceptanceEvidence"],
      additionalProperties: false,
    },
  },
  {
    name: "report_failure",
    description: "Mark a claimed job as failed and record the actionable reason.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" }, message: { type: "string", maxLength: 4000 } },
      required: ["jobId", "message"],
      additionalProperties: false,
    },
  },
] as const;

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });
}

function toolResult(value: unknown, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], structuredContent: typeof value === "object" ? value : undefined, isError };
}

function stringArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function ownedJob(jobId: string, workspaceId: string, tokenId?: string) {
  return db.query.agentJobs.findFirst({
    where: and(
      eq(agentJobs.id, jobId),
      eq(agentJobs.workspaceId, workspaceId),
      ...(tokenId ? [eq(agentJobs.claimedByTokenId, tokenId)] : [])
    ),
  });
}

async function callTool(name: string, args: Record<string, unknown>, token: NonNullable<Awaited<ReturnType<typeof authenticateAgentToken>>>) {
  const writeTools = new Set(["claim_job", "report_progress", "submit_result", "report_failure"]);
  const requiredScope = writeTools.has(name) ? "agent:write" : "agent:read";
  if (!token.scopes.includes(requiredScope)) {
    return toolResult({ error: "INSUFFICIENT_TOKEN_SCOPE", requiredScope }, true);
  }
  if (name === "list_available_jobs") {
    const jobs = await db.query.agentJobs.findMany({
      where: and(eq(agentJobs.workspaceId, token.workspaceId), eq(agentJobs.status, "queued")),
      orderBy: [desc(agentJobs.createdAt)],
      limit: 25,
    });
    const taskRows = jobs.length
      ? await db.query.tasks.findMany({ where: inArray(tasks.id, jobs.map((job) => job.taskId)) })
      : [];
    const taskById = new Map(taskRows.map((task) => [task.id, task]));
    return toolResult(jobs.map((job) => ({
      id: job.id,
      contextVersion: job.contextVersion,
      createdAt: job.createdAt.toISOString(),
      task: taskById.get(job.taskId) ? {
        id: job.taskId,
        title: taskById.get(job.taskId)?.title,
        priority: taskById.get(job.taskId)?.priority,
      } : null,
    })));
  }

  const jobId = stringArg(args, "jobId");
  if (!jobId) return toolResult({ error: "jobId is required" }, true);

  if (name === "claim_job") {
    const clientName = stringArg(args, "clientName");
    if (!clientName) return toolResult({ error: "clientName is required" }, true);
    const now = new Date();
    const [claimed] = await db.update(agentJobs).set({
      status: "claimed",
      claimedByClient: clientName.slice(0, 120),
      claimedByTokenId: token.id,
      claimedAt: now,
      startedAt: now,
      updatedAt: now,
    }).where(and(
      eq(agentJobs.id, jobId),
      eq(agentJobs.workspaceId, token.workspaceId),
      eq(agentJobs.status, "queued")
    )).returning();
    if (!claimed) return toolResult({ error: "JOB_NOT_AVAILABLE" }, true);
    await db.insert(agentJobEvents).values({
      jobId,
      workspaceId: token.workspaceId,
      type: "claimed",
      message: `Claimed by ${clientName}`,
      metadata: { clientName, tokenId: token.id },
    });
    await writeAuditLog({
      userId: token.userId,
      workspaceId: token.workspaceId,
      event: "agent.job_claimed",
      metadata: { jobId, clientName, tokenId: token.id },
    });
    return toolResult({ jobId, status: claimed.status, contextVersion: claimed.contextVersion });
  }

  const job = await ownedJob(jobId, token.workspaceId, token.id);
  if (!job) return toolResult({ error: "JOB_NOT_CLAIMED_BY_THIS_TOKEN" }, true);
  if (job.status === "outdated") return toolResult({ error: "AGENT_CONTEXT_OUTDATED", contextVersion: job.contextVersion }, true);

  if (name === "get_job_context") {
    return toolResult({
      jobId: job.id,
      status: job.status,
      contextVersion: job.contextVersion,
      contextHash: job.contextHash,
      context: job.contextSnapshot,
    });
  }

  if (name === "report_progress") {
    if (!["claimed", "running"].includes(job.status)) return toolResult({ error: "JOB_NOT_RUNNING" }, true);
    const message = stringArg(args, "message");
    if (!message) return toolResult({ error: "message is required" }, true);
    const phase = stringArg(args, "phase");
    await db.transaction(async (tx) => {
      await tx.update(agentJobs).set({ status: "running", updatedAt: new Date() }).where(eq(agentJobs.id, jobId));
      await tx.insert(agentJobEvents).values({
        jobId,
        workspaceId: token.workspaceId,
        type: "progress",
        message: message.slice(0, 2000),
        metadata: phase ? { phase: phase.slice(0, 80) } : null,
      });
    });
    return toolResult({ jobId, status: "running" });
  }

  if (name === "report_failure") {
    if (!["claimed", "running"].includes(job.status)) return toolResult({ error: "JOB_NOT_RUNNING" }, true);
    const message = stringArg(args, "message");
    if (!message) return toolResult({ error: "message is required" }, true);
    await db.transaction(async (tx) => {
      await tx.update(agentJobs).set({ status: "failed", completedAt: new Date() }).where(eq(agentJobs.id, jobId));
      await tx.insert(agentJobEvents).values({ jobId, workspaceId: token.workspaceId, type: "failed", message: message.slice(0, 4000) });
    });
    await writeAuditLog({
      userId: token.userId,
      workspaceId: token.workspaceId,
      event: "agent.job_failed",
      status: "failed",
      metadata: { jobId, tokenId: token.id },
    });
    return toolResult({ jobId, status: "failed" });
  }

  if (name === "submit_result") {
    if (!["claimed", "running"].includes(job.status)) return toolResult({ error: "JOB_NOT_RUNNING" }, true);
    const pullRequestUrl = stringArg(args, "pullRequestUrl");
    const commitSha = stringArg(args, "commitSha");
    const summary = stringArg(args, "summary");
    const testsInput = Array.isArray(args.tests) ? args.tests : [];
    const evidenceInput = Array.isArray(args.acceptanceEvidence) ? args.acceptanceEvidence : [];
    if (!pullRequestUrl || !commitSha || !summary || !/^[0-9a-f]{7,64}$/i.test(commitSha) || testsInput.length === 0) {
      return toolResult({ error: "PR, commit SHA, summary and at least one test result are required." }, true);
    }
    const repository = await db.query.workspaceRepositories.findFirst({
      where: and(
        eq(workspaceRepositories.id, job.repositoryId),
        eq(workspaceRepositories.workspaceId, token.workspaceId)
      ),
    });
    if (!repository || !pullRequestBelongsToRepository(pullRequestUrl, repository)) {
      return toolResult({ error: "PULL_REQUEST_REPOSITORY_MISMATCH" }, true);
    }
    const githubIntegration = await db.query.workspaceIntegrations.findFirst({
      where: and(
        eq(workspaceIntegrations.workspaceId, token.workspaceId),
        eq(workspaceIntegrations.provider, "github"),
        eq(workspaceIntegrations.status, "connected")
      ),
    });
    if (!githubIntegration?.installationId) {
      return toolResult({
        error: "GITHUB_VERIFICATION_NOT_CONFIGURED",
        message: "A connected GitHub App is required before submitting a pull request.",
        retryable: false,
      }, true);
    }
    let githubVerification;
    try {
      githubVerification = await verifyGitHubPullRequestSubmission({
        installationId: githubIntegration.installationId,
        owner: repository.repositoryOwner,
        repo: repository.repositoryName,
        defaultBranch: repository.defaultBranch,
        pullRequestUrl,
        commitSha,
      });
    } catch (error) {
      if (error instanceof GitHubVerificationError) {
        return toolResult({
          error: error.code,
          message: error.message,
          retryable: error.retryable,
        }, true);
      }
      throw error;
    }
    const tests = testsInput.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const command = stringArg(item, "command");
      const status = stringArg(item, "status");
      if (!command || !status || !["passed", "failed", "skipped"].includes(status)) return [];
      return [{ command, status, output: typeof item.output === "string" ? item.output.slice(0, 5000) : undefined }];
    });
    if (tests.length !== testsInput.length) return toolResult({ error: "INVALID_TEST_RESULTS" }, true);
    const evidence = evidenceInput.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const requirementKey = stringArg(item, "requirementKey");
      const criterion = stringArg(item, "criterion");
      const proof = stringArg(item, "evidence");
      return requirementKey && criterion && proof ? [{ requirementKey, criterion, evidence: proof }] : [];
    });
    const snapshot = job.contextSnapshot as { requirements?: Array<{ key: string; acceptanceCriteria: string[] }> };
    const requiredCriteria = (snapshot.requirements || []).flatMap((requirement) =>
      requirement.acceptanceCriteria.map((criterion) => ({ key: requirement.key, criterion }))
    );
    const missingCriteria = requiredCriteria.filter((required) => !evidence.some(
      (item) => item.requirementKey === required.key && item.criterion === required.criterion
    ));
    if (evidence.length !== evidenceInput.length || missingCriteria.length > 0) {
      return toolResult({ error: "ACCEPTANCE_EVIDENCE_INCOMPLETE", missingCriteria }, true);
    }
    const [{ nextRevision }] = await db.select({
      nextRevision: sql<number>`coalesce(max(${agentJobSubmissions.revision}), 0) + 1`,
    }).from(agentJobSubmissions).where(eq(agentJobSubmissions.jobId, jobId));
    const now = new Date();
    const submission = await db.transaction(async (tx) => {
      const [created] = await tx.insert(agentJobSubmissions).values({
        jobId,
        workspaceId: token.workspaceId,
        revision: Number(nextRevision),
        pullRequestUrl,
        commitSha,
        summary: summary.slice(0, 5000),
        tests,
        acceptanceEvidence: evidence,
      }).returning();
      await tx.update(agentJobs).set({ status: "submitted", submittedAt: now, updatedAt: now }).where(eq(agentJobs.id, jobId));
      await tx.update(tasks).set({ status: "in_review", completedAt: null, updatedAt: now }).where(eq(tasks.id, job.taskId));
      await tx.insert(agentJobEvents).values({
        jobId,
        workspaceId: token.workspaceId,
        type: "submitted",
        message: "Pull request submitted for human review.",
        metadata: {
          submissionId: created.id,
          pullRequestUrl,
          revision: created.revision,
          githubVerification: {
            pullRequestNumber: githubVerification.number,
            headSha: githubVerification.headSha,
            headBranch: githubVerification.headBranch,
            baseBranch: githubVerification.baseBranch,
          },
        },
      });
      return created;
    });
    await writeAuditLog({
      userId: token.userId,
      workspaceId: token.workspaceId,
      event: "agent.result_submitted",
      metadata: {
        jobId,
        submissionId: submission.id,
        pullRequestUrl,
        revision: submission.revision,
        githubVerification: {
          pullRequestNumber: githubVerification.number,
          headSha: githubVerification.headSha,
          baseBranch: githubVerification.baseBranch,
        },
      },
    });
    return toolResult({
      jobId,
      status: "submitted",
      submissionId: submission.id,
      humanApprovalRequired: true,
      githubVerification: {
        pullRequestNumber: githubVerification.number,
        pullRequestUrl: githubVerification.url,
        headSha: githubVerification.headSha,
        baseBranch: githubVerification.baseBranch,
      },
    });
  }

  return toolResult({ error: `Unknown tool: ${name}` }, true);
}

export async function POST(request: NextRequest) {
  const token = await authenticateAgentToken(request);
  if (!token) return NextResponse.json({ error: "Invalid or expired agent token" }, { status: 401 });
  const limit = await checkPersistentRateLimit(token.id, "agent:mcp:minute", 120, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", resetAt: limit.resetAt }, { status: 429 });

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_MCP_REQUEST_BYTES) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  }
  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > MAX_MCP_REQUEST_BYTES) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  }
  const rpc = (() => {
    try {
      return JSON.parse(rawBody) as JsonRpcRequest;
    } catch {
      return null;
    }
  })();
  if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.method) return rpcError(rpc?.id, -32600, "Invalid Request");
  if (rpc.method === "initialize") {
    return rpcResult(rpc.id, {
      protocolVersion: typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "nexus-agent-handoff", version: "1.0.0" },
      instructions: "Claim only jobs explicitly dispatched by the user. Never mark work complete; submit a PR and evidence for human review.",
    });
  }
  if (rpc.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (rpc.method === "ping") return rpcResult(rpc.id, {});
  if (rpc.method === "tools/list") return rpcResult(rpc.id, { tools });
  if (rpc.method === "tools/call") {
    const name = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    const args = rpc.params?.arguments && typeof rpc.params.arguments === "object"
      ? rpc.params.arguments as Record<string, unknown>
      : {};
    try {
      return rpcResult(rpc.id, await callTool(name, args, token));
    } catch (error) {
      console.error("[MCP] Tool call failed:", error);
      return rpcResult(rpc.id, toolResult({ error: "TOOL_CALL_FAILED" }, true));
    }
  }
  return rpcError(rpc.id, -32601, "Method not found");
}

export async function GET() {
  return NextResponse.json({ name: "Nexus Agent Handoff MCP", transport: "streamable-http", status: "ready" });
}
