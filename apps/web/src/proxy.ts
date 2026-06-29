import { NextRequest, NextResponse } from "next/server";

function hasSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => {
      const name = cookie.name.toLowerCase();
      return name.includes("better-auth") || name.includes("session");
    });
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
