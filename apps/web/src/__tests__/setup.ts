import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach } from "vitest";

// ==========================================
// GLOBAL TEST CONFIGURATION
// ==========================================

// Environment variables for testing
process.env.DATABASE_URL = "postgresql://nexus:nexusdev@localhost:5433/nexus";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.OPENAI_API_KEY = "sk-test-openai-key";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
process.env.GROQ_API_KEY = "gsk_test-groq-key";

// Mock fetch globally with tracking
const fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

global.fetch = vi.fn((url: string | Request | URL, options?: RequestInit) => {
  const urlString = url instanceof Request ? url.url : url.toString();
  fetchCalls.push({ url: urlString, options });
  return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
});

// Helper to get fetch calls
export function getFetchCalls() {
  return fetchCalls;
}

// Helper to clear fetch calls
export function clearFetchCalls() {
  fetchCalls.length = 0;
}

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useParams: () => ({}),
  redirect: vi.fn(),
}));

// Mock Next.js headers
vi.mock("next/headers", () => ({
  headers: () => new Headers({
    "content-type": "application/json",
  }),
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// ==========================================
// TEST UTILITIES
// ==========================================

// Create a mock request with proper body handling
export function createMockRequest(
  url: string, 
  options: { 
    method?: string; 
    body?: unknown; 
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = "GET", body, headers = {} } = options;
  
  const request = new Request(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
  
  return request;
}

// Mock session for authenticated tests
export const mockSession = {
  user: {
    id: "test-user-id",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "test-session-id",
    userId: "test-user-id",
    token: "test-token",
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  },
};

// Mock database results
export const mockWorkspace = {
  id: "test-workspace-id",
  name: "Test Workspace",
  description: "Test workspace description",
  ownerId: "test-user-id",
  iconUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockDoc = {
  id: "test-doc-id",
  workspaceId: "test-workspace-id",
  parentId: null,
  title: "Test Document",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Test content" }] }],
  iconEmoji: "📄",
  coverUrl: null,
  isArchived: 0,
  createdBy: "test-user-id",
  embedding: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockTask = {
  id: "test-task-id",
  workspaceId: "test-workspace-id",
  title: "Test Task",
  description: "Test task description",
  status: "todo" as const,
  priority: "medium" as const,
  assigneeId: null,
  assigneeAgentType: null,
  dueDate: null,
  createdBy: "test-user-id",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockUserSettings = {
  id: "test-settings-id",
  userId: "test-user-id",
  defaultModel: "gemini-2.5-flash",
  geminiApiKey: null,
  openaiApiKey: null,
  anthropicApiKey: null,
  groqApiKey: null,
  autoSaveAiOutputs: true,
  emailNotifications: true,
  agentNotifications: true,
  taskReminders: true,
  theme: "system",
  compactMode: false,
  offlineMode: false,
  syncFrequency: "realtime",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  clearFetchCalls();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==========================================
// RESPONSE HELPERS
// ==========================================

export function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createErrorResponse(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function isValidISO8601(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
