import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect for /dashboard only — NOT an authorization boundary.
 *
 * The proxy runs on every dashboard navigation, so it does not hit the
 * database: it only checks that the exact better-auth session cookie
 * (`better-auth.session_token`, or its `__Secure-` variant) is present, which
 * sends signed-out visitors to /login without rendering the shell. It used to
 * accept any cookie whose name merely contained "session".
 *
 * Real validation happens server-side on every request:
 *  - app/dashboard/layout.tsx calls auth.api.getSession() and redirects when
 *    the session is missing, expired or revoked;
 *  - every API route authenticates itself (verifySession / protectRoute /
 *    auth.api.getSession, webhook signatures, or signed OAuth state), so a
 *    forged cookie that passes this check gets nothing.
 */
function hasSessionCookie(request: NextRequest | Request) {
  return getSessionCookie(request) !== null;
}

export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
