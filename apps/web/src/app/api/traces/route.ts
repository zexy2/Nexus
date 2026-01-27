import { NextRequest, NextResponse } from "next/server";
import { getAllTraces, getTrace } from "@/lib/observability";

export const runtime = "nodejs";

// GET - Get traces for debugging/visualization
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get("traceId");
  const limit = parseInt(searchParams.get("limit") || "50");

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
