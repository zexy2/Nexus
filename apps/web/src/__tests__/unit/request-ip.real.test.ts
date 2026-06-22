import { describe, expect, it } from "vitest";
import { getTrustedProxyClientIP } from "@/lib/request-ip";

describe("trusted proxy client IP", () => {
  it("uses the proxy-appended final hop instead of a spoofable first value", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.10, 203.0.113.42",
    });
    expect(getTrustedProxyClientIP(headers)).toBe("203.0.113.42");
  });

  it("falls back to x-real-ip and then localhost", () => {
    expect(getTrustedProxyClientIP(new Headers({ "x-real-ip": "203.0.113.5" }))).toBe("203.0.113.5");
    expect(getTrustedProxyClientIP(new Headers())).toBe("127.0.0.1");
  });
});
