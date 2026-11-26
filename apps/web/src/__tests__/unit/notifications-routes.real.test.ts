/**
 * In-app notifications: list / mark read / mark all read are scoped to the
 * caller, and emission is idempotent per (user, dedupe key).
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharedFake as fake } from "../helpers/fake-db";

vi.mock("@/lib/db", async () => ({ db: (await import("../helpers/fake-db")).sharedFake.db }));

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...args: unknown[]) => protectRoute(...args),
  RATE_LIMITS: {
    workflowStatus: { windowMs: 1000, maxRequests: 100, keyPrefix: "wf" },
    default: { windowMs: 1000, maxRequests: 100, keyPrefix: "default" },
  },
}));

const reconcileRunningWorkflowExecutions = vi.fn();
vi.mock("@/lib/workflow-reconcile", () => ({
  reconcileRunningWorkflowExecutions: (...args: unknown[]) => reconcileRunningWorkflowExecutions(...args),
}));

import { GET as listRoute } from "@/app/api/notifications/route";
import { POST as readRoute } from "@/app/api/notifications/read/route";
import { createNotification } from "@/lib/notifications";

const A1 = "00000000-0000-4000-8000-0000000000a1";
const A2 = "00000000-0000-4000-8000-0000000000a2";
const B1 = "00000000-0000-4000-8000-0000000000b1";

function asUser(id: string) {
  protectRoute.mockResolvedValue({ success: true, user: { id, email: `${id}@x.com`, name: id } });
}

function list() {
  return listRoute(new NextRequest("http://localhost:3000/api/notifications"));
}

function markRead(body: unknown) {
  return readRoute(
    new NextRequest("http://localhost:3000/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const row = (id: string) => fake.rows("notifications").find((item) => item.id === id)!;

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  asUser("alice");
  reconcileRunningWorkflowExecutions.mockImplementation(async (rows: unknown) => rows);
  const base = { workspaceId: "ws-1", data: { workflowType: "research" }, readAt: null };
  fake.seed("notifications", { ...base, id: A1, userId: "alice", type: "workflow_completed", dedupeKey: "a1" });
  fake.seed("notifications", { ...base, id: A2, userId: "alice", type: "plan_review_pending", dedupeKey: "a2" });
  fake.seed("notifications", { ...base, id: B1, userId: "bob", type: "workflow_failed", dedupeKey: "b1" });
});

describe("GET /api/notifications", () => {
  it("rejects unauthenticated requests", async () => {
    protectRoute.mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await list()).status).toBe(401);
  });

  it("lists only the caller's notifications with their unread count", async () => {
    const response = await list();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.notifications.map((item: { id: string }) => item.id).sort()).toEqual([A1, A2]);
    expect(body.unreadCount).toBe(2);
    expect(JSON.stringify(body)).not.toContain(B1);
  });

  it("reconciles only the caller's own running runs before listing", async () => {
    fake.seed("agent_executions", { id: "e-alice", createdBy: "alice", status: "running", workspaceId: "ws-1" });
    fake.seed("agent_executions", { id: "e-done", createdBy: "alice", status: "completed", workspaceId: "ws-1" });
    fake.seed("agent_executions", { id: "e-bob", createdBy: "bob", status: "running", workspaceId: "ws-1" });

    await list();

    expect(reconcileRunningWorkflowExecutions).toHaveBeenCalledTimes(1);
    const [rows, options] = reconcileRunningWorkflowExecutions.mock.calls[0]!;
    expect((rows as Array<{ id: string }>).map((item) => item.id)).toEqual(["e-alice"]);
    expect(options).toMatchObject({ userId: "alice" });
  });

  it("still lists when reconciliation fails (Temporal down)", async () => {
    fake.seed("agent_executions", { id: "e-alice", createdBy: "alice", status: "running", workspaceId: "ws-1" });
    reconcileRunningWorkflowExecutions.mockRejectedValue(new Error("temporal down"));

    const response = await list();
    expect(response.status).toBe(200);
    expect((await response.json()).notifications).toHaveLength(2);
  });
});

describe("POST /api/notifications/read", () => {
  it("marks the given notifications read", async () => {
    const response = await markRead({ ids: [A1] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, unreadCount: 1 });
    expect(row(A1).readAt).toBeInstanceOf(Date);
    expect(row(A2).readAt).toBeNull();
  });

  it("ignores ids that belong to another user", async () => {
    const response = await markRead({ ids: [B1, A2] });

    expect(await response.json()).toEqual({ updated: 1, unreadCount: 1 });
    expect(row(B1).readAt).toBeNull();
    expect(row(A2).readAt).toBeInstanceOf(Date);
  });

  it("marks all of the caller's notifications read, and only theirs", async () => {
    const response = await markRead({ all: true });

    expect(await response.json()).toEqual({ updated: 2, unreadCount: 0 });
    expect(row(A1).readAt).toBeInstanceOf(Date);
    expect(row(A2).readAt).toBeInstanceOf(Date);
    expect(row(B1).readAt).toBeNull();

    asUser("bob");
    const bob = await (await list()).json();
    expect(bob.unreadCount).toBe(1);
  });

  it("does not re-mark already read notifications", async () => {
    await markRead({ ids: [A1] });
    expect(await (await markRead({ ids: [A1] })).json()).toEqual({ updated: 0, unreadCount: 1 });
  });

  it.each([
    [{}],
    [{ ids: [] }],
    [{ ids: ["not-a-uuid"] }],
    [{ all: "yes" }],
  ])("rejects an invalid body %j with 400", async (body) => {
    expect((await markRead(body)).status).toBe(400);
  });
});

describe("createNotification", () => {
  it("emits once per (user, dedupe key)", async () => {
    const first = await createNotification({ userId: "carol", type: "workflow_completed", dedupeKey: "workflow:e1:completed" });
    const second = await createNotification({ userId: "carol", type: "workflow_completed", dedupeKey: "workflow:e1:completed" });

    expect([first, second]).toEqual([true, false]);
    expect(fake.rows("notifications").filter((item) => item.userId === "carol")).toHaveLength(1);
  });

  it("uses the same dedupe key independently per user", async () => {
    await createNotification({ userId: "carol", type: "plan_review_pending", dedupeKey: "plan_review:cs-1" });
    await createNotification({ userId: "dave", type: "plan_review_pending", dedupeKey: "plan_review:cs-1" });
    expect(fake.rows("notifications").filter((item) => item.dedupeKey === "plan_review:cs-1")).toHaveLength(2);
  });

  it("respects a user who turned agent notifications off", async () => {
    fake.seed("user_settings", { id: "s1", userId: "erin", agentNotifications: false });
    expect(await createNotification({ userId: "erin", type: "workflow_failed", dedupeKey: "x" })).toBe(false);
    expect(fake.rows("notifications").some((item) => item.userId === "erin")).toBe(false);
  });
});
