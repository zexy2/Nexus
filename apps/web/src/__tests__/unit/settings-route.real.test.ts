/**
 * Real route-handler tests for /api/settings (GET + PATCH).
 *
 * Drives the actual handlers: the auth gate, default-settings creation on first
 * read, the assembled response shape, and the PATCH upsert (update vs insert).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const userSettingsFindFirst = vi.fn();
const usersFindFirst = vi.fn();
const repositoriesFindFirst = vi.fn();
const workspaceIntegrationsFindMany = vi.fn();
const insertReturning = vi.fn();
const insertValues = vi.fn(() => ({ returning: insertReturning }));
const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      userSettings: { findFirst: (...a: unknown[]) => userSettingsFindFirst(...a) },
      users: { findFirst: (...a: unknown[]) => usersFindFirst(...a) },
      workspaceRepositories: { findFirst: (...a: unknown[]) => repositoriesFindFirst(...a) },
      workspaceIntegrations: { findMany: (...a: unknown[]) => workspaceIntegrationsFindMany(...a) },
    },
    insert: () => ({ values: (...a: unknown[]) => insertValues(...a) }),
    update: () => ({ set: (...a: unknown[]) => updateSet(...a) }),
  },
}));

const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const getAiProviderStatus = vi.fn();
const getAiUsageLimits = vi.fn();
const getAiUsageRemaining = vi.fn();
const isAdminEmail = vi.fn();
const isDemoEmail = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  getAiProviderStatus: (...a: unknown[]) => getAiProviderStatus(...a),
  getAiUsageLimits: (...a: unknown[]) => getAiUsageLimits(...a),
  getAiUsageRemaining: (...a: unknown[]) => getAiUsageRemaining(...a),
  isAdminEmail: (...a: unknown[]) => isAdminEmail(...a),
  isDemoEmail: (...a: unknown[]) => isDemoEmail(...a),
}));

import { GET, PATCH } from "@/app/api/settings/route";

const authed = { user: { id: "user-1", email: "u@x.com" } };
const defaultSettings = {
  userId: "user-1",
  defaultModel: "gemini-2.5-flash",
  autoSaveAiOutputs: true,
  emailNotifications: true,
  agentNotifications: true,
  taskReminders: true,
  theme: "system",
  compactMode: false,
  offlineMode: true,
  syncFrequency: "realtime",
};

function patchReq(body: unknown) {
  return new Request("http://localhost:3000/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAiProviderStatus.mockReturnValue({
    aiEnabled: true,
    geminiAvailable: true,
    openaiAvailable: false,
    tavilyAvailable: false,
    primaryProvider: "gemini",
  });
  getAiUsageLimits.mockReturnValue({
    globalDaily: 100, userDaily: 5, workflowDaily: 3, chatDaily: 10, maxStepsPerWorkflow: 5,
  });
  getAiUsageRemaining.mockResolvedValue({ globalDaily: 100, userDaily: 5, workflowsDaily: 3, chatDaily: 10 });
  isAdminEmail.mockReturnValue(false);
  isDemoEmail.mockReturnValue(false);
  ensureDefaultWorkspace.mockResolvedValue({ id: "ws-1", ownerId: "user-1", name: "Workspace" });
  repositoriesFindFirst.mockResolvedValue(null);
  workspaceIntegrationsFindMany.mockResolvedValue([]);
});

describe("GET /api/settings (real handler)", () => {
  it("returns 401 without a session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("creates default settings on first read and returns the assembled shape", async () => {
    verifySession.mockResolvedValue(authed);
    userSettingsFindFirst.mockResolvedValue(undefined); // none yet
    insertReturning.mockResolvedValue([defaultSettings]);
    usersFindFirst.mockResolvedValue({ id: "user-1", name: "Zeki", email: "u@x.com", image: null });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalled(); // default row created
    const body = await res.json();
    expect(body.profile).toMatchObject({ id: "user-1", name: "Zeki", email: "u@x.com" });
    expect(body.ai.defaultModel).toBe("gemini-2.5-flash");
    expect(body.ai.keyManagement).toBe("server");
    expect(body.ai.byokEnabled).toBe(false);
    expect(body.notifications.emailNotifications).toBe(true);
    expect(body.appearance.theme).toBe("system");
    expect(body.sync.offlineMode).toBe(true);
    expect(body.integrations).toMatchObject({
      connectionEnabled: true,
      items: [],
    });
  });

  it("uses existing settings without creating new ones", async () => {
    verifySession.mockResolvedValue(authed);
    userSettingsFindFirst.mockResolvedValue({ ...defaultSettings, theme: "dark" });
    usersFindFirst.mockResolvedValue({ id: "user-1", name: "Zeki", email: "u@x.com", image: null });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(insertValues).not.toHaveBeenCalled();
    expect((await res.json()).appearance.theme).toBe("dark");
  });
});

describe("PATCH /api/settings (real handler)", () => {
  it("returns 401 without a session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await PATCH(patchReq({ theme: "dark" }));
    expect(res.status).toBe(401);
  });

  it("updates the profile name and updates existing settings", async () => {
    verifySession.mockResolvedValue(authed);
    userSettingsFindFirst.mockResolvedValue(defaultSettings); // exists -> update path
    updateWhere.mockResolvedValue(undefined);

    const res = await PATCH(patchReq({ name: "Yeni Ad", theme: "dark", compactMode: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // name update + settings update both went through db.update().set()
    expect(updateSet).toHaveBeenCalled();
    const settingsPayload = updateSet.mock.calls.map((c) => c[0]);
    expect(settingsPayload.some((p) => p && (p as { theme?: string }).theme === "dark")).toBe(true);
  });

  it("inserts settings when none exist yet (upsert insert path)", async () => {
    verifySession.mockResolvedValue(authed);
    userSettingsFindFirst.mockResolvedValue(undefined); // none -> insert path
    insertReturning.mockResolvedValue([defaultSettings]);

    const res = await PATCH(patchReq({ syncFrequency: "manual" }));
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalled();
  });
});
