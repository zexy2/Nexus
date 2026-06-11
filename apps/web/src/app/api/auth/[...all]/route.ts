import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { isPublicSignupEnabled, writeAuditLog } from "@/lib/production-guardrails";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  if (!isPublicSignupEnabled() && pathname.includes("/sign-up/")) {
    const seedToken = process.env.DEMO_SEED_TOKEN;
    const requestSeedToken = request.headers.get("x-demo-seed-token");
    if (seedToken && requestSeedToken === seedToken) {
      return handlers.POST(request);
    }

    await writeAuditLog({
      event: "auth.signup_blocked",
      status: "blocked",
      request,
    });
    return NextResponse.json(
      {
        error: "SIGNUP_DISABLED",
        message: "Public signup is disabled for this portfolio demo. Use the demo account.",
      },
      { status: 403 }
    );
  }

  return handlers.POST(request);
}
