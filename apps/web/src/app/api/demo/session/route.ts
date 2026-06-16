import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemoMode, writeAuditLog } from "@/lib/production-guardrails";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { users } from "@nexus/database/schema";

export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: false,
    rateLimit: RATE_LIMITS.demoLogin,
  });
  if (!protection.success) return protection.response;

  if (!isDemoMode()) {
    return NextResponse.json(
      {
        error: "DEMO_MODE_DISABLED",
        message: "Demo login is not enabled on this server.",
      },
      { status: 403 }
    );
  }

  const requiredAccessCode = process.env.DEMO_ACCESS_CODE;
  if (requiredAccessCode) {
    const body = await request.json().catch(() => ({}));
    const providedAccessCode =
      request.headers.get("x-demo-access-code") ||
      (typeof body?.accessCode === "string" ? body.accessCode : "");

    if (providedAccessCode !== requiredAccessCode) {
      await writeAuditLog({
        event: "auth.demo_login",
        status: "blocked",
        request,
        metadata: { reason: "invalid_demo_access_code" },
      });

      return NextResponse.json(
        {
          error: "DEMO_ACCESS_CODE_REQUIRED",
          message: "Demo access requires a valid access code.",
        },
        { status: 403 }
      );
    }
  }

  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      {
        error: "DEMO_USER_NOT_READY",
        message: "Demo account credentials are not configured on this server.",
      },
      { status: 503 }
    );
  }

  const [demoUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!demoUser) {
    await writeAuditLog({
      event: "auth.demo_login",
      status: "failed",
      request,
      metadata: { reason: "missing_demo_user", email },
    });

    return NextResponse.json(
      {
        error: "DEMO_USER_NOT_READY",
        message: "Demo account has not been seeded yet.",
      },
      { status: 503 }
    );
  }

  try {
    const authResponse = await auth.api.signInEmail({
      body: {
        email,
        password,
        callbackURL: "/dashboard",
        rememberMe: true,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!authResponse.ok) {
      await writeAuditLog({
        event: "auth.demo_login",
        status: "failed",
        request,
        metadata: { reason: "auth_rejected", status: authResponse.status },
      });

      return NextResponse.json(
        {
          error: "DEMO_USER_NOT_READY",
          message: "Demo account cannot be used right now.",
        },
        { status: 503 }
      );
    }

    await writeAuditLog({
      userId: demoUser.id,
      event: "auth.demo_login",
      status: "success",
      request,
    });

    const response = NextResponse.json({ ok: true, redirectTo: "/dashboard" });
    authResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        response.headers.append(key, value);
      }
    });

    return response;
  } catch (error) {
    await writeAuditLog({
      event: "auth.demo_login",
      status: "failed",
      request,
      metadata: {
        reason: "unexpected_error",
        message: error instanceof Error ? error.message : String(error),
      },
    });

    return NextResponse.json(
      {
        error: "DEMO_USER_NOT_READY",
        message: "Demo login failed.",
      },
      { status: 503 }
    );
  }
}
