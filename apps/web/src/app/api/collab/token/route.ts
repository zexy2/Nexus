import { NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { docs, workspaceMembers, workspaces } from "@nexus/database/schema";
import { verifySession } from "@/lib/api-middleware";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/api-response";
import { signCollabToken } from "@/lib/collab-token";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/collab/token?docId=<uuid>
 *
 * Issues a short-lived, document-scoped token for the realtime collaboration
 * server, but only after verifying the session AND that the user can access the
 * document (workspace owner or member) — the same membership-aware check the
 * REST doc routes use. The collab server then trusts this token instead of
 * accepting anonymous connections to any document.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorized();
  }

  const docId = request.nextUrl.searchParams.get("docId");
  if (!docId || !UUID_REGEX.test(docId)) {
    return badRequest("A valid docId query parameter is required");
  }

  const secret = process.env.COLLAB_AUTH_SECRET;
  if (!secret) {
    console.error("[Collab] COLLAB_AUTH_SECRET is not set; refusing to issue tokens.");
    return serverError("Collaboration is not configured on this server");
  }

  try {
    // Membership-aware authorization: the user must own the doc's workspace or
    // be a member of it.
    const [row] = await db
      .select({ id: docs.id })
      .from(docs)
      .innerJoin(workspaces, eq(docs.workspaceId, workspaces.id))
      .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(docs.id, docId),
          or(eq(workspaces.ownerId, session.user.id), eq(workspaceMembers.userId, session.user.id))
        )
      )
      .limit(1);

    if (!row) {
      // Don't distinguish "not found" from "forbidden" to avoid id probing.
      return forbidden("You do not have access to this document");
    }

    const token = signCollabToken({ d: docId, u: session.user.id }, secret);
    return Response.json({ token });
  } catch (error) {
    console.error("[Collab] Failed to issue token:", error);
    return serverError("Failed to issue collaboration token");
  }
}
