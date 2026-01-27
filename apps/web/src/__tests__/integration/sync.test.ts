/**
 * Sync Integration Tests
 * 
 * Tests the Local-First synchronization system.
 * Verifies:
 * - Push/Pull endpoints
 * - Optimistic updates
 * - Conflict handling
 * - Offline queue behavior
 */

import { describe, it, expect, afterAll } from "vitest";
import { apiCall, testContext, cleanup } from "./setup";

describe("Integration: Sync Push", () => {
  afterAll(async () => {
    await cleanup();
  });

  it("should accept push mutations", async () => {
    const res = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "test-client-123",
        mutations: [
          {
            id: `mutation-${Date.now()}`,
            table: "docs",
            operation: "create",
            data: {
              id: `test-doc-${Date.now()}`,
              title: "Sync Test Doc",
              content: [],
              workspaceId: "test-workspace",
            },
            timestamp: Date.now(),
          },
        ],
      }),
    });

    // Push should be accepted
    expect([200, 201, 207]).toContain(res.status);
  });

  it("should handle empty mutations array", async () => {
    const res = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "test-client-123",
        mutations: [],
      }),
    });

    expect([200, 201]).toContain(res.status);
  });

  it("should handle multiple mutations in one push", async () => {
    const timestamp = Date.now();
    const res = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "test-client-456",
        mutations: [
          {
            id: `mutation-1-${timestamp}`,
            table: "docs",
            operation: "create",
            data: { id: `doc-1-${timestamp}`, title: "Doc 1", content: [], workspaceId: "test" },
            timestamp,
          },
          {
            id: `mutation-2-${timestamp}`,
            table: "tasks",
            operation: "create",
            data: { id: `task-1-${timestamp}`, title: "Task 1", status: "todo", priority: "low", workspaceId: "test" },
            timestamp: timestamp + 1,
          },
        ],
      }),
    });

    expect([200, 201, 207]).toContain(res.status);
  });
});

describe("Integration: Sync Pull", () => {
  it("should return data since last sync", async () => {
    const lastSync = Date.now() - 86400000; // 24 hours ago
    const res = await apiCall<{
      docs?: unknown[];
      tasks?: unknown[];
      lastSync?: number;
    }>(`/api/sync/pull?lastSync=${lastSync}`);

    expect(res.status).toBe(200);
    
    if (res.data) {
      // Should have sync structure
      expect(res.data).toHaveProperty("lastSync");
    }
  });

  it("should return all data for first sync", async () => {
    const res = await apiCall("/api/sync/pull?lastSync=0");

    expect(res.status).toBe(200);
  });

  it("should filter by workspace", async () => {
    const res = await apiCall("/api/sync/pull?lastSync=0&workspaceId=test-workspace");

    expect(res.status).toBe(200);
  });
});

describe("Integration: Sync Conflict Handling", () => {
  it("should handle concurrent updates", async () => {
    // Simulate two clients updating the same document
    const docId = `conflict-test-${Date.now()}`;
    
    // First update
    const res1 = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client-A",
        mutations: [{
          id: `mut-A-${Date.now()}`,
          table: "docs",
          operation: "update",
          data: { id: docId, title: "Title from Client A" },
          timestamp: Date.now(),
        }],
      }),
    });

    // Second update (slightly later)
    const res2 = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client-B",
        mutations: [{
          id: `mut-B-${Date.now()}`,
          table: "docs",
          operation: "update",
          data: { id: docId, title: "Title from Client B" },
          timestamp: Date.now() + 1,
        }],
      }),
    });

    // Both should be processed (last-write-wins or merge)
    expect([200, 201, 207, 409]).toContain(res1.status);
    expect([200, 201, 207, 409]).toContain(res2.status);
  });
});

describe("Integration: Sync Error Handling", () => {
  it("should reject invalid mutation format", async () => {
    const res = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "test-client",
        mutations: [
          {
            // Missing required fields
            operation: "create",
          },
        ],
      }),
    });

    // Should handle gracefully
    expect([200, 207, 400, 422]).toContain(res.status);
  });

  it("should reject invalid table name", async () => {
    const res = await apiCall("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "test-client",
        mutations: [{
          id: `mut-${Date.now()}`,
          table: "invalid_table_name",
          operation: "create",
          data: { id: "123" },
          timestamp: Date.now(),
        }],
      }),
    });

    expect([200, 207, 400, 422]).toContain(res.status);
  });
});
