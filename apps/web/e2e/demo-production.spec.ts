import { expect, test, type Page } from "@playwright/test";

async function pollWorkflow(page: Page, workflowId: string) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const response = await page.request.get(`/api/workflows/${workflowId}`);
    expect(response.ok()).toBeTruthy();
    const status = await response.json() as {
      status: string;
      result?: Record<string, unknown>;
      steps?: unknown[];
      error?: string;
    };

    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(status.error || `Workflow ${workflowId} failed`);
    }

    await page.waitForTimeout(5000);
  }

  throw new Error(`Workflow ${workflowId} did not complete before timeout`);
}

async function pollPendingChangeSet(page: Page, docId: string) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const response = await page.request.get(
      `/api/change-sets?docId=${docId}&status=pending&limit=1`
    );
    expect(response.ok()).toBeTruthy();
    const rows = await response.json() as Array<{ id: string }>;
    if (rows[0]?.id) return rows[0].id;
    await page.waitForTimeout(5000);
  }

  throw new Error("Plan impact workflow did not create a pending change set");
}

test.describe("public demo production smoke", () => {
  test.skip(
    process.env.DEMO_E2E !== "true",
    "Set DEMO_E2E=true against a running demo environment."
  );

  test("isolated demo proves Living Plan, Kanban, workflow history, and coding-agent evidence", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("public-demo-login").click();
    await page.waitForURL(/\/dashboard/);

    const codingJobsResponse = await page.request.get("/api/agent-jobs");
    expect(codingJobsResponse.ok()).toBeTruthy();
    const codingJobs = await codingJobsResponse.json() as Array<{
      id: string;
      status: string;
      claimedByClient: string | null;
      task: { id: string; title: string } | null;
    }>;
    const proofJob = codingJobs.find((job) =>
      job.status === "approved" && job.claimedByClient === "Codex"
    );
    expect(proofJob?.task?.id).toBeTruthy();

    const proofResponse = await page.request.get(`/api/agent-jobs/${proofJob!.id}`);
    expect(proofResponse.ok()).toBeTruthy();
    const proof = await proofResponse.json() as {
      submissions: Array<{ pullRequestUrl: string; reviewStatus: string }>;
    };
    expect(proof.submissions[0]?.pullRequestUrl).toBe("https://github.com/zexy2/Nexus/pull/33");
    expect(proof.submissions[0]?.reviewStatus).toBe("approved");

    const bootstrapResponse = await page.request.post("/api/onboarding/bootstrap", {
      data: { includeStarterData: true },
    });
    expect(bootstrapResponse.ok()).toBeTruthy();

    const bootstrap = await bootstrapResponse.json() as {
      workspace: { id: string };
    };

    const workflowResponse = await page.request.post("/api/workflows", {
      data: {
        workflowType: "document",
        workspaceId: bootstrap.workspace.id,
        input: {
          title: "Recruiter Demo Brief",
          prompt: "Write a short project brief for Nexus as an AI workspace portfolio demo.",
        },
      },
    });
    expect(workflowResponse.status()).toBe(202);

    const workflow = await workflowResponse.json() as {
      workflowId: string;
      executionId: string;
      status: string;
    };
    expect(workflow.status).toBe("running");
    expect(workflow.workflowId).toBeTruthy();
    expect(workflow.executionId).toBeTruthy();

    const documentStatus = await pollWorkflow(page, workflow.workflowId);
    expect(documentStatus.steps?.length).toBeGreaterThan(0);
    expect(documentStatus.result?.documentId).toBeTruthy();

    const documentId = String(documentStatus.result?.documentId);
    await page.goto(`/dashboard/docs/${documentId}`);
    await expect(page.getByDisplayValue("Recruiter Demo Brief")).toBeVisible();

    const taskWorkflowResponse = await page.request.post("/api/workflows", {
      data: {
        workflowType: "tasks",
        workspaceId: bootstrap.workspace.id,
        input: {
          docId: documentId,
          projectDescription: "Create 3 Kanban-ready implementation tasks from the Nexus recruiter demo brief.",
        },
      },
    });
    expect(taskWorkflowResponse.status()).toBe(202);

    const taskWorkflow = await taskWorkflowResponse.json() as {
      workflowId: string;
      executionId: string;
      status: string;
    };
    const taskStatus = await pollWorkflow(page, taskWorkflow.workflowId);
    const createdTasks = taskStatus.result?.tasks as Array<{ id: string; title: string }> | undefined;
    expect(createdTasks?.length).toBeGreaterThan(0);

    const kanbanResponse = await page.request.get("/api/tasks");
    expect(kanbanResponse.ok()).toBeTruthy();
    const kanbanTasks = await kanbanResponse.json() as Array<{ id: string }>;
    const kanbanTaskIds = new Set(kanbanTasks.map((task) => task.id));
    expect(createdTasks?.some((task) => kanbanTaskIds.has(task.id))).toBeTruthy();

    const impactResponse = await page.request.post(`/api/plans/${documentId}/analyze-change`, {
      data: {},
    });
    expect(impactResponse.status()).toBe(202);
    const impact = await impactResponse.json() as { workflowId: string };
    const changeSetId = await pollPendingChangeSet(page, documentId);

    const changeSetResponse = await page.request.get(`/api/change-sets/${changeSetId}`);
    expect(changeSetResponse.ok()).toBeTruthy();
    const changeSet = await changeSetResponse.json() as {
      proposals: Array<{ id: string; status: string }>;
    };
    const selectedProposalIds = changeSet.proposals
      .filter((proposal) => proposal.status === "pending")
      .slice(0, 3)
      .map((proposal) => proposal.id);
    expect(selectedProposalIds.length).toBeGreaterThan(0);

    const applyResponse = await page.request.post(`/api/change-sets/${changeSetId}/apply`, {
      data: { selectedProposalIds },
    });
    expect(applyResponse.ok()).toBeTruthy();
    const impactStatus = await pollWorkflow(page, impact.workflowId);
    expect(impactStatus.status).toBe("completed");

    await page.goto("/dashboard/agents");
    await expect(page.getByText("Coding Agent Runs")).toBeVisible();
    await expect(page.getByText("Polish the landing workflow story")).toBeVisible();
    await expect(page.getByText(/Codex/)).toBeVisible();
  });
});
