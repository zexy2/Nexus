/**
 * Integration Test Setup
 * 
 * These tests make real API calls to verify end-to-end functionality.
 * They require:
 * - Database connection (DATABASE_URL)
 * - Running dev server (localhost:3000) OR test server
 * 
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Base URL for API calls
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// Test utilities
export async function apiCall<T>(
  endpoint: string,
  options?: RequestInit
): Promise<{ status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { status: res.status, data: data as T };
  } catch (error) {
    return {
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Shared test context
export interface TestContext {
  baseUrl: string;
  createdDocIds: string[];
  createdTaskIds: string[];
  sessionCookie?: string;
}

export const testContext: TestContext = {
  baseUrl: BASE_URL,
  createdDocIds: [],
  createdTaskIds: [],
};

// Cleanup helper
export async function cleanup() {
  // Delete created docs
  for (const docId of testContext.createdDocIds) {
    await apiCall(`/api/docs/${docId}`, { method: "DELETE" });
  }
  testContext.createdDocIds = [];

  // Delete created tasks
  for (const taskId of testContext.createdTaskIds) {
    await apiCall(`/api/tasks/${taskId}`, { method: "DELETE" });
  }
  testContext.createdTaskIds = [];
}
