import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/production-guardrails";
import { getAiUsageReport } from "@/lib/ai/usage-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/ai-usage — AI call counts, tokens, errors, top users and
// global limits for the owner. Admin-only (ADMIN_EMAILS + verified email).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email, session.user.emailVerified)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getAiUsageReport(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin/ai-usage] report failed:", error);
    return NextResponse.json({ error: "Failed to build AI usage report" }, { status: 500 });
  }
}
