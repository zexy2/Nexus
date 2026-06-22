import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  clampDemoSessionExpiry,
  DemoCapacityError,
  expireProvisionedDemoUser,
  provisionIsolatedDemoSession,
  secureAccessCodeMatches,
} from "@/lib/demo-sessions";
import { isDemoMode, writeAuditLog } from "@/lib/production-guardrails";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { users } from "@nexus/database/schema";

export const runtime = "nodejs";

function copySessionCookies(source: Response, target: NextResponse) {
  source.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      target.headers.append(key, value);
    }
  });
}

export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: false,
    rateLimit: RATE_LIMITS.demoLogin,
  });
  if (!protection.success) return protection.response;

  if (!isDemoMode()) {
    return NextResponse.json(
      { error: "DEMO_MODE_DISABLED", message: "Demo login is not enabled on this server." },
      { status: 403 }
    );
  }

  const requiredAccessCode = process.env.DEMO_ACCESS_CODE;
  if (requiredAccessCode) {
    const body = await request.json().catch(() => ({}));
    const providedAccessCode =
      request.headers.get("x-demo-access-code") ||
      (typeof body?.accessCode === "string" ? body.accessCode : "");

    if (!secureAccessCodeMatches(requiredAccessCode, providedAccessCode)) {
      await writeAuditLog({
        event: "auth.demo_login",
        status: "blocked",
        request,
        metadata: { reason: "invalid_demo_access_code" },
      });

      return NextResponse.json(
        { error: "DEMO_ACCESS_CODE_REQUIRED", message: "Demo access requires a valid access code." },
        { status: 403 }
      );
    }
  }

  const currentSession = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (currentSession?.user) {
    const [currentUser] = await db
      .select({ isDemo: users.isDemo, demoExpiresAt: users.demoExpiresAt })
      .from(users)
      .where(eq(users.id, currentSession.user.id))
      .limit(1);

    // Never replace a valid real-user session with a demo identity. A valid
    // isolated demo session is also reused instead of allocating more data.
    const reusableDemo =
      currentUser?.isDemo &&
      currentUser.demoExpiresAt &&
      currentUser.demoExpiresAt > new Date();
    if (currentUser && (!currentUser.isDemo || reusableDemo)) {
      return NextResponse.json({
        ok: true,
        redirectTo: "/dashboard",
        reusedSession: true,
      });
    }
  }

  let provisioned: Awaited<ReturnType<typeof provisionIsolatedDemoSession>> | null = null;

  try {
    provisioned = await provisionIsolatedDemoSession();

    const authResponse = await auth.api.signInEmail({
      body: {
        email: provisioned.email,
        password: provisioned.password,
        callbackURL: "/dashboard",
        rememberMe: false,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!authResponse.ok) {
      await expireProvisionedDemoUser(provisioned.userId);
      await writeAuditLog({
        event: "auth.demo_login",
        status: "failed",
        request,
        metadata: { reason: "auth_rejected", status: authResponse.status },
      });

      return NextResponse.json(
        { error: "DEMO_USER_NOT_READY", message: "Demo session cannot be created right now." },
        { status: 503 }
      );
    }

    await clampDemoSessionExpiry(provisioned.userId, provisioned.expiresAt);
    await writeAuditLog({
      userId: provisioned.userId,
      workspaceId: provisioned.workspaceId,
      event: "auth.demo_login",
      status: "success",
      request,
      metadata: { isolation: "ephemeral_workspace", expiresAt: provisioned.expiresAt.toISOString() },
    });

    const response = NextResponse.json({
      ok: true,
      redirectTo: "/dashboard",
      expiresAt: provisioned.expiresAt.toISOString(),
    });
    copySessionCookies(authResponse, response);
    return response;
  } catch (error) {
    if (provisioned) {
      await expireProvisionedDemoUser(provisioned.userId).catch(() => undefined);
    }

    const capacityReached = error instanceof DemoCapacityError;
    await writeAuditLog({
      event: "auth.demo_login",
      status: capacityReached ? "blocked" : "failed",
      request,
      metadata: {
        reason: capacityReached ? "capacity_reached" : "unexpected_error",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { message: error.message }
          : {}),
      },
    });

    return NextResponse.json(
      capacityReached
        ? {
            error: "DEMO_CAPACITY_REACHED",
            message: "The public demo is at capacity. Try again after another session expires.",
          }
        : { error: "DEMO_USER_NOT_READY", message: "Demo login failed." },
      { status: 503 }
    );
  }
}
