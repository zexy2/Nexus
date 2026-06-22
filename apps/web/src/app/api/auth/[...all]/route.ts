import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { isPublicSignupEnabled, writeAuditLog } from "@/lib/production-guardrails";
import { db } from "@/lib/db";
import { users } from "@nexus/database/schema";
import { eq } from "drizzle-orm";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const pathname = new URL(request.url).pathname;

  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (session?.user && !pathname.includes("/sign-out")) {
    const [user] = await db
      .select({ isDemo: users.isDemo })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (user?.isDemo) {
      await writeAuditLog({
        userId: session.user.id,
        event: "auth.demo_account_mutation",
        status: "blocked",
        request,
        metadata: { pathname },
      });
      return NextResponse.json(
        {
          error: "DEMO_ACCOUNT_IMMUTABLE",
          message: "Temporary demo account credentials cannot be changed.",
        },
        { status: 403 }
      );
    }
  }

  if (!isPublicSignupEnabled() && pathname.includes("/sign-up/")) {
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
