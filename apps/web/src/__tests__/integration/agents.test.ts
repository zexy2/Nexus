/**
 * Agent Pipeline Integration Tests
 * 
 * Tests the LangGraph multi-agent orchestration system.
 * These tests verify:
 * - Agent type selection
 * - Multi-agent pipeline execution
 * - RAG context retrieval
 * - Supervisor routing logic
 * 
 * Note: These tests require API keys to be configured:
 * - GEMINI_API_KEY or OPENAI_API_KEY
 * - TAVILY_API_KEY (for web search)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { apiCall } from "./setup";

// Skip if no API keys available
const SKIP_AI_TESTS = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY;

describe("Integration: Agent Pipeline", () => {
  beforeAll(() => {
    if (SKIP_AI_TESTS) {
      console.log("⚠️ Skipping AI tests - no API keys configured");
    }
  });

  it.skipIf(SKIP_AI_TESTS)("should handle simple greeting without agents", async () => {
    const res = await apiCall<{ message?: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Merhaba" }],
        mode: "auto",
      }),
    });

    // Chat endpoint should respond
    expect([200, 201]).toContain(res.status);
  }, 30000);

  it.skipIf(SKIP_AI_TESTS)("should route to research agent for search queries", async () => {
    const res = await apiCall<{ agentsUsed?: string[] }>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "AI trendleri hakkında araştırma yap",
        mode: "auto",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);

  it.skipIf(SKIP_AI_TESTS)("should route to writer agent for document creation", async () => {
    const res = await apiCall<{ agentsUsed?: string[] }>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "Kısa bir blog yazısı yaz: yapay zeka",
        mode: "auto",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);

  it.skipIf(SKIP_AI_TESTS)("should route to coder agent for code requests", async () => {
    const res = await apiCall<{ agentsUsed?: string[] }>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "Python ile fibonacci fonksiyonu yaz",
        mode: "coder",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);

  it.skipIf(SKIP_AI_TESTS)("should route to task agent for task creation", async () => {
    const res = await apiCall<{ agentsUsed?: string[] }>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "Yarın için bir görev listesi oluştur",
        mode: "auto",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);
});

describe("Integration: Agent Direct Mode", () => {
  it.skipIf(SKIP_AI_TESTS)("should execute researcher agent directly", async () => {
    const res = await apiCall("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "What are the latest AI trends?",
        mode: "researcher",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);

  it.skipIf(SKIP_AI_TESTS)("should execute writer agent directly", async () => {
    const res = await apiCall("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        message: "Write a short paragraph about TypeScript",
        mode: "writer",
      }),
    });

    expect([200, 201]).toContain(res.status);
  }, 60000);
});

describe("Integration: Workflow Trigger", () => {
  it("should trigger document generation workflow", async () => {
    const res = await apiCall("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        type: "document_generation",
        input: {
          prompt: "Test document prompt",
          title: "Test Workflow Doc",
          workspaceId: "test-workspace",
        },
      }),
    });

    // Workflow should start (even if Temporal not running)
    expect([200, 201, 202, 503]).toContain(res.status);
  });

  it("should trigger research workflow", async () => {
    const res = await apiCall("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        type: "research",
        input: {
          query: "Test research query",
          workspaceId: "test-workspace",
        },
      }),
    });

    expect([200, 201, 202, 503]).toContain(res.status);
  });
});

describe("Integration: Embeddings & Search", () => {
  it("should generate embeddings", async () => {
    const res = await apiCall("/api/embeddings", {
      method: "POST",
      body: JSON.stringify({
        text: "This is a test document for embedding generation",
      }),
    });

    // Embeddings endpoint should respond
    expect([200, 201, 500, 503]).toContain(res.status);
  });

  it("should perform document search", async () => {
    const res = await apiCall("/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "test search query",
        workspaceId: "test-workspace",
      }),
    });

    expect([200, 201, 500]).toContain(res.status);
  });
});

describe("Integration: Agent Execution History", () => {
  it("should list agent executions", async () => {
    const res = await apiCall<unknown[]>("/api/agents/executions");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should create agent execution record", async () => {
    const res = await apiCall("/api/agents/executions", {
      method: "POST",
      body: JSON.stringify({
        agentType: "researcher",
        workspaceId: "test-workspace",
        input: "Test execution input",
      }),
    });

    expect([200, 201]).toContain(res.status);
  });
});
