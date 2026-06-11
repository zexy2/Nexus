import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@nexus/database/schema";
import { and, eq, or } from "drizzle-orm";

export type WorkspaceAccess = {
  id: string;
  role: "owner" | "admin" | "member";
};

export async function getAccessibleWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId)));

  return Array.from(new Set(rows.map((row) => row.id).filter(Boolean)));
}

export async function ensureDefaultWorkspace(userId: string, name = "My Workspace") {
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
  });

  if (existing) return existing;

  const [workspace] = await db
    .insert(workspaces)
    .values({ name, ownerId: userId })
    .returning();

  return workspace;
}

export async function requireWorkspaceAccess(
  userId: string,
  workspaceId?: string | null
): Promise<{ ok: true; workspaceId: string; role: WorkspaceAccess["role"] } | { ok: false; status: 403 | 404; error: string }> {
  const targetWorkspaceId = workspaceId || (await ensureDefaultWorkspace(userId)).id;

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, targetWorkspaceId),
  });

  if (!workspace) {
    return { ok: false, status: 404, error: "Workspace not found" };
  }

  if (workspace.ownerId === userId) {
    return { ok: true, workspaceId: targetWorkspaceId, role: "owner" };
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, targetWorkspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });

  if (!membership) {
    return { ok: false, status: 403, error: "Workspace access denied" };
  }

  return {
    ok: true,
    workspaceId: targetWorkspaceId,
    role: membership.role === "admin" ? "admin" : "member",
  };
}

export async function requireWorkspaceOwner(
  userId: string,
  workspaceId: string
): Promise<{ ok: true; workspaceId: string } | { ok: false; status: 403 | 404; error: string }> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    return { ok: false, status: 404, error: "Workspace not found" };
  }

  if (workspace.ownerId !== userId) {
    return { ok: false, status: 403, error: "Workspace owner access required" };
  }

  return { ok: true, workspaceId };
}
