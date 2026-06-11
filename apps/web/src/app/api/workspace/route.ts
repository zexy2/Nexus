import { verifySession } from "@/lib/api-middleware";
import { unauthorized, serverError } from "@/lib/api-response";
import { ensureDefaultWorkspace } from "@/lib/workspace-auth";

// GET /api/workspace - the caller's default workspace (created if absent).
// Used by the local-first client to learn its workspaceId so optimistic,
// offline writes can be attributed and authorized on sync push.
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }

    const workspace = await ensureDefaultWorkspace(session.user.id);

    return Response.json({ id: workspace.id, name: workspace.name });
  } catch (error) {
    console.error("Failed to resolve default workspace:", error);
    return serverError("Failed to resolve workspace");
  }
}
