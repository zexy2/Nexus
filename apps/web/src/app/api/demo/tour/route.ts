import { NextResponse } from "next/server";
import { verifySession } from "@/lib/api-middleware";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";
import { loadDemoTourProgress } from "@/lib/demo-tour";
import { getAiUsageLimits, getAiUsageRemaining, isDemoEmail } from "@/lib/production-guardrails";

export const runtime = "nodejs";

/**
 * GET /api/demo/tour — guided first-run tour state for public demo sessions.
 * Non-demo users get `{ active: false }` so the client renders nothing.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDemoEmail(session.user.email)) {
    return NextResponse.json({ active: false });
  }

  const workspaceIds = await getAccessibleWorkspaceIds(session.user.id);
  const state = await loadDemoTourProgress(workspaceIds);
  if (!state) {
    return NextResponse.json({ active: false });
  }

  const limits = getAiUsageLimits(false, true);
  const remaining = await getAiUsageRemaining(session.user.id, session.user.email);

  return NextResponse.json(
    {
      active: true,
      // Scopes the client-side "dismissed" flag to this demo session.
      sessionKey: session.user.id,
      planDocId: state.planDocId,
      planTitle: state.planTitle,
      steps: {
        edit: state.progress.edited,
        analyze: state.progress.analyzed,
        apply: state.progress.applied,
      },
      changeSetId: state.progress.changeSetId,
      changeSetStatus: state.progress.changeSetStatus,
      quota: {
        workflowsRemaining: remaining.workflowsDaily,
        workflowsPerDay: limits.workflowDaily,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
