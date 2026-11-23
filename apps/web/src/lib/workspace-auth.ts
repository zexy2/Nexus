import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@nexus/database/schema";
import { and, asc, eq, or } from "drizzle-orm";

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

const DEFAULT_WORKSPACE_INDEX = "workspaces_owner_default_idx";

function isDefaultWorkspaceConflict(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505") {
      const name = candidate.constraint_name ?? candidate.constraint;
      return typeof name !== "string" || name === DEFAULT_WORKSPACE_INDEX;
    }
    current = candidate.cause;
  }
  return false;
}

async function findDefaultWorkspace(userId: string) {
  return db.query.workspaces.findFirst({
    where: and(eq(workspaces.ownerId, userId), eq(workspaces.isDefault, true)),
  });
}

/**
 * The caller's default workspace, created on first use.
 *
 * At most one default per owner is enforced by the partial unique index
 * `workspaces_owner_default_idx`, so concurrent first requests converge on
 * one row instead of each inserting its own "My Workspace" (previous
 * find-then-insert race). Owners without a flagged default (workspaces made
 * through sync or before the flag existed) get their oldest workspace
 * promoted.
 */
export async function ensureDefaultWorkspace(userId: string, name = "My Workspace") {
  const current = await findDefaultWorkspace(userId);
  if (current) return current;

  const oldest = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
    orderBy: [asc(workspaces.createdAt), asc(workspaces.id)],
  });

  try {
    if (oldest) {
      const [promoted] = await db
        .update(workspaces)
        .set({ isDefault: true })
        .where(and(eq(workspaces.id, oldest.id), eq(workspaces.ownerId, userId)))
        .returning();
      if (promoted) return promoted;
    } else {
      const [created] = await db
        .insert(workspaces)
        .values({ name, ownerId: userId, isDefault: true })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
    }
  } catch (error) {
    if (!isDefaultWorkspaceConflict(error)) throw error;
  }

  // Another request won the race: use its default.
  const winner = await findDefaultWorkspace(userId);
  if (!winner) throw new Error("Failed to resolve the default workspace");
  return winner;
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
