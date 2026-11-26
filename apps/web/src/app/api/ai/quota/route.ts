import { NextResponse } from "next/server";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { getAiQuotaStatus } from "@/lib/production-guardrails";

/**
 * GET /api/ai/quota - today's AI quota for the signed-in user.
 *
 * Read-only (consumes nothing). Feeds the "N left today" badges next to the
 * chat composer and the workflow start buttons.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) return unauthorized();

  try {
    const quota = await getAiQuotaStatus(session.user.id, session.user.email);
    return NextResponse.json(quota, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[AI quota] Failed to read quota:", error);
    return NextResponse.json({ error: "Failed to read AI quota" }, { status: 500 });
  }
}
