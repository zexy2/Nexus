import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/production-guardrails";
import { getAllTraces, getTrace } from "@/lib/observability";

export const runtime = "nodejs";

// GET - Get traces for debugging/visualization
// Protected: traces contain raw AI prompt inputs/outputs, so this is admin-only.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get("traceId");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);

  if (traceId) {
    const trace = getTrace(traceId);
    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }
    return NextResponse.json(trace);
  }

  const traces = getAllTraces().slice(0, limit);

  return NextResponse.json({
    traces,
    total: traces.length,
    summary: {
      completed: traces.filter(t => t.status === "completed").length,
      failed: traces.filter(t => t.status === "failed").length,
      running: traces.filter(t => t.status === "running").length,
      totalTokens: traces.reduce((sum, t) => sum + t.tokens, 0),
    }
  });
}
