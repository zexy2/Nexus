/**
 * Agent-job state races: every transition is a guarded UPDATE evaluated
 * against current state, so a concurrent cancel/review/dispatch cannot be
 * overwritten by a request that validated against a stale snapshot.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { agentJobs } from "@nexus/database/schema";
import { sharedFake as fake } from "../helpers/fake-db";

vi.mock("@/lib/db", async () => ({ db: (await import("../helpers/fake-db")).sharedFake.db }));

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...args: unknown[]) => verifySession(...args),
}));

vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: vi.fn(async (_userId: string, workspaceId: string) => ({ ok: true, workspaceId, role: "owner" })),
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
  checkPersistentRateLimit: vi.fn(async () => ({ allowed: true })),
  isDemoEmail: vi.fn(() => false),
}));

const token = {
  id: "token-1",
  workspaceId: "ws-1",
  userId: "user-1",
  scopes: ["agent:read", "agent:write"],
};
vi.mock("@/lib/agent-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-handoff")>()),
  authenticateAgentToken: vi.fn(async () => token),
}));

const verifyPullRequest = vi.fn();
vi.mock("@/lib/integrations/providers/github-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/providers/github-client")>()),
  verifyGitHubPullRequestSubmission: (...args: unknown[]) => verifyPullRequest(...args),
}));

import { POST as mcpPost } from "@/app/api/mcp/route";
import { POST as cancelJob } from "@/app/api/agent-jobs/[id]/cancel/route";
import { POST as reviewJob } from "@/app/api/agent-jobs/[id]/review/route";
import { POST as dispatchJob } from "@/app/api/tasks/[id]/agent-jobs/route";
import { createAgentJob } from "@/lib/agent-handoff";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function rpc(name: string, args: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer nxs_agent_test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}

async function toolPayload(response: Response) {
  const body = await response.json();
  return { isError: body.result.isError as boolean, value: JSON.parse(body.result.content[0].text) };
}

function post(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const job = (id: string) => fake.rows("agent_jobs").find((row) => row.id === id)!;

const submitArgs = {
  jobId: "job-1",
  pullRequestUrl: "https://github.com/acme/app/pull/7",
  commitSha: "abcdef1",
  summary: "Implements the task.",
  tests: [{ command: "pnpm test", status: "passed" }],
  acceptanceEvidence: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  verifySession.mockResolvedValue({ user: { id: "user-1", email: "owner@example.com" } });
  fake.seed("tasks", { id: "task-1", workspaceId: "ws-1", title: "Task", description: null, priority: "medium", status: "in_progress", isArchived: 0, docId: null });
  fake.seed("workspace_repositories", {
    id: "repo-1",
    workspaceId: "ws-1",
    repositoryUrl: "https://github.com/acme/app",
    repositoryOwner: "acme",
    repositoryName: "app",
    defaultBranch: "main",
  });
  fake.seed("workspace_integrations", { id: "int-1", workspaceId: "ws-1", provider: "github", status: "connected", installationId: "99" });
  verifyPullRequest.mockResolvedValue({
    number: 7,
    url: submitArgs.pullRequestUrl,
    headSha: "abcdef1".padEnd(40, "0"),
    headBranch: "feature",
    baseBranch: "main",
  });
});

describe("MCP transitions re-check job status", () => {
  beforeEach(() => {
    fake.seed("agent_jobs", {
      id: "job-1",
      workspaceId: "ws-1",
      taskId: "task-1",
      repositoryId: "repo-1",
      status: "running",
      claimedByTokenId: "token-1",
      contextVersion: 1,
      contextSnapshot: { requirements: [] },
    });
    fake.selectResult = () => [{ nextRevision: 1 }];
  });

  it("cancelled job + submit_result → stays cancelled", async () => {
    // The user cancels while the agent's submission is being verified on GitHub.
    verifyPullRequest.mockImplementationOnce(async () => {
      const cancelled = await cancelJob(post("http://localhost:3000/api/agent-jobs/job-1/cancel"), params("job-1"));
      expect(cancelled.status).toBe(200);
      return {
        number: 7,
        url: submitArgs.pullRequestUrl,
        headSha: "abcdef1".padEnd(40, "0"),
        headBranch: "feature",
        baseBranch: "main",
      };
    });

    const result = await toolPayload(await mcpPost(rpc("submit_result", submitArgs)));

    expect(result.isError).toBe(true);
    expect(result.value).toMatchObject({ error: "JOB_NOT_RUNNING", status: "cancelled" });
    expect(job("job-1").status).toBe("cancelled");
    expect(fake.rows("agent_job_submissions")).toHaveLength(0);
    expect(fake.rows("tasks")[0]!.status).toBe("in_progress");
    expect(fake.rows("agent_job_events").map((event) => event.type)).toEqual(["cancelled"]);
    expect(writeAuditLog).not.toHaveBeenCalledWith(expect.objectContaining({ event: "agent.result_submitted" }));
  });

  it("submit_result on a running job still submits", async () => {
    const result = await toolPayload(await mcpPost(rpc("submit_result", submitArgs)));
    expect(result.isError).toBe(false);
    expect(job("job-1").status).toBe("submitted");
    expect(fake.rows("agent_job_submissions")).toHaveLength(1);
    expect(fake.rows("tasks")[0]!.status).toBe("in_review");
  });

  it("report_progress cannot revive a job cancelled after the snapshot was read", async () => {
    fake.hooks.afterFindFirst = (table, row) => {
      if (table === "agent_jobs" && row?.status === "running") job("job-1").status = "cancelled";
    };
    const result = await toolPayload(await mcpPost(rpc("report_progress", { jobId: "job-1", message: "working" })));
    expect(result).toMatchObject({ isError: true, value: { error: "JOB_NOT_RUNNING" } });
    expect(job("job-1").status).toBe("cancelled");
    expect(fake.rows("agent_job_events")).toHaveLength(0);
  });

  it("report_failure on an outdated job reports AGENT_CONTEXT_OUTDATED and changes nothing", async () => {
    fake.hooks.afterFindFirst = (table, row) => {
      if (table === "agent_jobs" && row?.status === "running") job("job-1").status = "outdated";
    };
    const result = await toolPayload(await mcpPost(rpc("report_failure", { jobId: "job-1", message: "boom" })));
    expect(result).toMatchObject({ isError: true, value: { error: "AGENT_CONTEXT_OUTDATED" } });
    expect(job("job-1").status).toBe("outdated");
  });
});

describe("review is atomic", () => {
  beforeEach(() => {
    fake.seed("agent_jobs", {
      id: "job-1",
      workspaceId: "ws-1",
      taskId: "task-1",
      repositoryId: "repo-1",
      status: "submitted",
      claimedByTokenId: "token-1",
      contextVersion: 1,
    });
    fake.seed("agent_job_submissions", { id: "sub-1", jobId: "job-1", workspaceId: "ws-1", revision: 1, reviewStatus: "pending" });
  });

  const review = (decision: string) =>
    reviewJob(post("http://localhost:3000/api/agent-jobs/job-1/review", { decision }), params("job-1"));

  it("double approve → second gets 409", async () => {
    const [first, second] = await Promise.all([review("approve"), review("approve")]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    await expect(loser.json()).resolves.toMatchObject({ error: "JOB_NOT_SUBMITTED" });
    expect(job("job-1").status).toBe("approved");
    expect(fake.rows("agent_job_events").filter((event) => event.type === "approved")).toHaveLength(1);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("concurrent approve and reject → exactly one decision is applied", async () => {
    const [approve, reject] = await Promise.all([review("approve"), review("reject")]);

    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const expected = approve.status === 200 ? { job: "approved", task: "done" } : { job: "rejected", task: "in_progress" };
    expect(job("job-1").status).toBe(expected.job);
    expect(fake.rows("agent_job_submissions")[0]!.reviewStatus).toBe(expected.job);
    expect(fake.rows("tasks")[0]!.status).toBe(expected.task);
  });

  it("a review after the job went outdated is rejected and rolled back", async () => {
    fake.hooks.afterFindFirst = (table, row) => {
      if (table === "agent_jobs" && row?.status === "submitted") job("job-1").status = "outdated";
    };
    const response = await review("approve");
    expect(response.status).toBe(409);
    expect(job("job-1").status).toBe("outdated");
    expect(fake.rows("agent_job_submissions")[0]!.reviewStatus).toBe("pending");
  });
});

describe("one active job per task", () => {
  it("declares a partial unique index on active statuses", () => {
    const index = getTableConfig(agentJobs).indexes.find((candidate) => candidate.config.name === "agent_jobs_task_active_idx");
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => (column as { name: string }).name)).toEqual(["task_id"]);
    const where = new PgDialect().sqlToQuery(index!.config.where!).sql;
    expect(where).toContain("in ('queued', 'claimed', 'running', 'submitted')");
  });

  it("concurrent create → one active job", async () => {
    const [first, second] = await Promise.all([
      dispatchJob(post("http://localhost:3000/api/tasks/task-1/agent-jobs"), params("task-1")),
      dispatchJob(post("http://localhost:3000/api/tasks/task-1/agent-jobs"), params("task-1")),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const loser = first.status === 409 ? first : second;
    await expect(loser.json()).resolves.toEqual({ error: "ACTIVE_AGENT_JOB_EXISTS" });
    expect(fake.rows("agent_jobs").filter((row) => row.status === "queued")).toHaveLength(1);
  });

  it("maps the unique-index violation to ACTIVE_AGENT_JOB_EXISTS when both requests pass the pre-check", async () => {
    // A competing dispatch commits between this request's pre-check and insert.
    let competing = false;
    fake.hooks.afterFindFirst = (table, row) => {
      if (table === "agent_jobs" && row === undefined && !competing) {
        competing = true;
        fake.seed("agent_jobs", { id: "job-other", workspaceId: "ws-1", taskId: "task-1", repositoryId: "repo-1", status: "queued" });
      }
    };

    await expect(createAgentJob("task-1", "ws-1", "user-1")).rejects.toThrow("ACTIVE_AGENT_JOB_EXISTS");
    expect(fake.rows("agent_jobs").map((row) => row.id)).toEqual(["job-other"]);
    expect(fake.rows("agent_job_events")).toHaveLength(0);
  });
});
