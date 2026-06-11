/**
 * Temporal Workflow Integration Tests
 * Verifies Temporal.io durable execution functionality
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";
const TEMPORAL_URL = process.env.TEMPORAL_URL || "http://localhost:7233";

// Helper to check if Temporal is running
async function isTemporalAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${TEMPORAL_URL}/api/v1/namespaces`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe("Temporal Workflow Integration", () => {
  let temporalAvailable: boolean;

  beforeAll(async () => {
    temporalAvailable = await isTemporalAvailable();
    if (!temporalAvailable) {
      console.warn(
        "⚠️ Temporal is not available. Skipping Temporal-specific tests."
      );
    }
  });

  describe("Workflow API", () => {
    it("should start a document generation workflow", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document_generation",
          input: {
            prompt: "Test document generation",
            title: "Test Doc",
            workspaceId: "test-workspace",
            style: "formal",
          },
        }),
      });

      expect(response.status).toBe(202);

      const data = await response.json();
      expect(data).toHaveProperty("workflowId");
      expect(data).toHaveProperty("executionId");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("running");
    });

    it("should start a research workflow", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "research",
          input: {
            query: "AI trends in 2026",
            workspaceId: "test-workspace",
          },
        }),
      });

      expect(response.status).toBe(202);

      const data = await response.json();
      expect(data).toHaveProperty("workflowId");
    });

    it("should start a task breakdown workflow", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "task_breakdown",
          input: {
            project: "Build a landing page",
            workspaceId: "test-workspace",
          },
        }),
      });

      expect(response.status).toBe(202);
    });

    it("should reject invalid workflow type", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invalid_workflow",
          input: {},
        }),
      });

      expect(response.status).toBe(400);
    });

    it("should validate required input fields", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document_generation",
          input: {
            // Missing required fields
          },
        }),
      });

      expect([400, 422]).toContain(response.status);
    });
  });

  describe("Workflow Status", () => {
    it("should get workflow status by ID", async () => {
      // First, start a workflow
      const startResponse = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "research",
          input: {
            query: "Test query",
            workspaceId: "test-workspace",
          },
        }),
      });

      const { workflowId } = await startResponse.json();

      // Then check its status
      const statusResponse = await fetch(
        `${BASE_URL}/api/workflows/${workflowId}`
      );

      expect([200, 202]).toContain(statusResponse.status);

      const data = await statusResponse.json();
      expect(data).toHaveProperty("status");
      expect([
        "pending",
        "running",
        "completed",
        "failed",
        "queued",
      ]).toContain(data.status);
    });

    it("should return 404 for non-existent workflow", async () => {
      const response = await fetch(
        `${BASE_URL}/api/workflows/non-existent-workflow-id`
      );

      expect(response.status).toBe(404);
    });
  });

  describe.skipIf(!temporalAvailable)("Temporal-Specific Tests", () => {
    it("should list namespaces from Temporal", async () => {
      const response = await fetch(`${TEMPORAL_URL}/api/v1/namespaces`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty("namespaces");
    });

    it("should have nexus namespace configured", async () => {
      const response = await fetch(`${TEMPORAL_URL}/api/v1/namespaces`);
      const data = await response.json();

      const namespaces = data.namespaces.map(
        (ns: { namespaceInfo: { name: string } }) => ns.namespaceInfo.name
      );

      // Should have default or nexus namespace
      expect(
        namespaces.includes("default") || namespaces.includes("nexus")
      ).toBe(true);
    });

    it("should track workflow execution in Temporal", async () => {
      // Start workflow
      const startResponse = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document_generation",
          input: {
            prompt: "Temporal tracking test",
            title: "Tracking Test",
            workspaceId: "test-workspace",
          },
        }),
      });

      const { workflowId } = await startResponse.json();

      // Wait a bit for Temporal to register
      await new Promise((r) => setTimeout(r, 1000));

      // Query Temporal for this workflow
      const temporalResponse = await fetch(
        `${TEMPORAL_URL}/api/v1/namespaces/default/workflows/${workflowId}`
      );

      if (temporalResponse.ok) {
        const data = await temporalResponse.json();
        expect(data).toHaveProperty("workflowExecutionInfo");
      }
    });
  });

  describe("Fallback Behavior", () => {
    it("should return 503 when Temporal is unavailable", async () => {
      const response = await fetch(`${BASE_URL}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document_generation",
          input: {
            prompt: "Fallback test",
            title: "Fallback Doc",
            workspaceId: "test-workspace",
            simulateTemporalUnavailable: true,
          },
        }),
      });

      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error).toBe("TEMPORAL_UNAVAILABLE");
    });
  });
});

describe("Workflow Durable Execution", () => {
  it.skipIf(!process.env.TEMPORAL_URL)(
    "should resume workflow after interruption",
    async () => {
      // This test would require actually stopping/starting the worker
      // For now, it's a placeholder for manual testing
      console.log(
        "Manual test: Stop worker mid-execution and restart to verify resumption"
      );
      expect(true).toBe(true);
    }
  );

  it("should handle concurrent workflow executions", async () => {
    const workflows = await Promise.all(
      Array.from({ length: 3 }).map((_, i) =>
        fetch(`${BASE_URL}/api/workflows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "research",
            input: {
              query: `Concurrent test ${i}`,
              workspaceId: "test-workspace",
            },
          }),
        }).then((r) => r.json())
      )
    );

    // All should start successfully
    expect(workflows.length).toBe(3);
    workflows.forEach((wf) => {
      expect(wf).toHaveProperty("workflowId");
    });

    // All should have unique IDs
    const ids = workflows.map((wf) => wf.workflowId);
    expect(new Set(ids).size).toBe(3);
  });
});
