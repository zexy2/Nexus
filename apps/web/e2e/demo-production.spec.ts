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

test.describe("public demo production smoke", () => {
  test.skip(
    process.env.DEMO_E2E !== "true",
    "Set DEMO_E2E=true on the VPS after seeding the demo user."
  );

  test("demo login, document workflow, task breakdown, Kanban, and history", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /try the public demo/i }).click();
    await page.waitForURL(/\/dashboard/);

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

    await page.goto("/dashboard");
    await expect(page.getByText("Agent Activity")).toBeVisible();

    await page.goto("/dashboard/agents");
    await expect(page.getByText(/Workflow Steps|Execution History/i)).toBeVisible();
  });
});
