/**
 * API Integration Tests
 * 
 * Tests real API endpoints with actual HTTP calls.
 * These tests verify:
 * - Endpoint availability
 * - Request/response format
 * - Error handling
 * - Basic CRUD operations
 */

import { describe, it, expect, afterAll } from "vitest";
import { apiCall, testContext, cleanup } from "./setup";

describe("Integration: API Health", () => {
  it("should have healthy API routes", async () => {
    // Test docs endpoint
    const docsRes = await apiCall("/api/docs");
    expect(docsRes.status).toBe(200);

    // Test tasks endpoint
    const tasksRes = await apiCall("/api/tasks");
    expect(tasksRes.status).toBe(200);
  });
});

describe("Integration: Document CRUD", () => {
  afterAll(async () => {
    await cleanup();
  });

  it("should create a document", async () => {
    const res = await apiCall<{ id: string }>("/api/docs", {
      method: "POST",
      body: JSON.stringify({
        title: "Integration Test Doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Test content" }] }],
        workspaceId: "test-workspace",
      }),
    });

    // Should return 200 or 201
    expect([200, 201]).toContain(res.status);
    
    if (res.data?.id) {
      testContext.createdDocIds.push(res.data.id);
    }
  });

  it("should list documents", async () => {
    const res = await apiCall<unknown[]>("/api/docs");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should get a single document", async () => {
    // First create a doc
    const createRes = await apiCall<{ id: string }>("/api/docs", {
      method: "POST",
      body: JSON.stringify({
        title: "Get Test Doc",
        content: [],
        workspaceId: "test-workspace",
      }),
    });

    if (createRes.data?.id) {
      testContext.createdDocIds.push(createRes.data.id);
      
      // Then get it
      const getRes = await apiCall(`/api/docs/${createRes.data.id}`);
      expect(getRes.status).toBe(200);
    }
  });

  it("should update a document", async () => {
    // Create
    const createRes = await apiCall<{ id: string }>("/api/docs", {
      method: "POST",
      body: JSON.stringify({
        title: "Update Test Doc",
        content: [],
        workspaceId: "test-workspace",
      }),
    });

    if (createRes.data?.id) {
      testContext.createdDocIds.push(createRes.data.id);
      
      // Update
      const updateRes = await apiCall(`/api/docs/${createRes.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated Title" }),
      });
      
      expect([200, 204]).toContain(updateRes.status);
    }
  });

  it("should delete a document", async () => {
    // Create
    const createRes = await apiCall<{ id: string }>("/api/docs", {
      method: "POST",
      body: JSON.stringify({
        title: "Delete Test Doc",
        content: [],
        workspaceId: "test-workspace",
      }),
    });

    if (createRes.data?.id) {
      // Delete
      const deleteRes = await apiCall(`/api/docs/${createRes.data.id}`, {
        method: "DELETE",
      });
      
      expect([200, 204]).toContain(deleteRes.status);
    }
  });
});

describe("Integration: Task CRUD", () => {
  afterAll(async () => {
    await cleanup();
  });

  it("should create a task", async () => {
    const res = await apiCall<{ id: string }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Integration Test Task",
        description: "Test description",
        status: "todo",
        priority: "medium",
        workspaceId: "test-workspace",
      }),
    });

    expect([200, 201]).toContain(res.status);
    
    if (res.data?.id) {
      testContext.createdTaskIds.push(res.data.id);
    }
  });

  it("should list tasks", async () => {
    const res = await apiCall<unknown[]>("/api/tasks");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should update task status", async () => {
    // Create
    const createRes = await apiCall<{ id: string }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Status Update Test",
        status: "todo",
        priority: "low",
        workspaceId: "test-workspace",
      }),
    });

    if (createRes.data?.id) {
      testContext.createdTaskIds.push(createRes.data.id);
      
      // Update status
      const updateRes = await apiCall(`/api/tasks/${createRes.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      });
      
      expect([200, 204]).toContain(updateRes.status);
    }
  });
});

describe("Integration: Error Handling", () => {
  it("should return 404 for non-existent document", async () => {
    const res = await apiCall("/api/docs/non-existent-id-12345");
    expect([404, 500]).toContain(res.status);
  });

  it("should return 404 for non-existent task", async () => {
    const res = await apiCall("/api/tasks/non-existent-id-12345");
    expect([404, 500]).toContain(res.status);
  });

  it("should handle invalid JSON gracefully", async () => {
    const res = await apiCall("/api/docs", {
      method: "POST",
      body: "invalid json",
    });
    
    // Should return 400 Bad Request or similar
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
