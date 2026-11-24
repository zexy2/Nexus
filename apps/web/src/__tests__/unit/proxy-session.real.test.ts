/**
 * Finding: "proxy.ts only checks cookie name exists".
 *
 * The proxy is an optimistic redirect (the dashboard layout and every API
 * route validate the session server-side). It must at least require the exact
 * better-auth session cookie instead of any cookie containing "session".
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const nav = (cookie?: string) =>
  new NextRequest("https://nexus.example/dashboard/docs", {
    headers: cookie ? { cookie } : {},
  });

const redirectsToLogin = (res: Response) =>
  res.status === 307 && new URL(res.headers.get("location")!).pathname === "/login";

describe("proxy.ts only checks cookie name exists", () => {
  it("redirects without any cookie", () => {
    expect(redirectsToLogin(proxy(nav()))).toBe(true);
  });

  it("redirects for unrelated cookies that merely contain 'session' or 'better-auth'", () => {
    expect(redirectsToLogin(proxy(nav("my_session=1")))).toBe(true);
    expect(redirectsToLogin(proxy(nav("better-auth.theme=dark")))).toBe(true);
  });

  it("lets the better-auth session cookie through (plain and __Secure-)", () => {
    expect(redirectsToLogin(proxy(nav("better-auth.session_token=abc.sig")))).toBe(false);
    expect(redirectsToLogin(proxy(nav("__Secure-better-auth.session_token=abc.sig")))).toBe(false);
  });
});
