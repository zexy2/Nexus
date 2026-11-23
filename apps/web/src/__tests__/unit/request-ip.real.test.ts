import { afterEach, describe, expect, it, vi } from "vitest";
import { getTrustedProxyClientIP, getTrustedProxyCount } from "@/lib/request-ip";

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

describe("Client IP detection assumes exactly one proxy (finding)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to one trusted proxy", () => {
    vi.stubEnv("TRUSTED_PROXY_COUNT", "");
    expect(getTrustedProxyCount()).toBe(1);
  });

  it("with TRUSTED_PROXY_COUNT=2 picks the client recorded by the outer proxy", () => {
    vi.stubEnv("TRUSTED_PROXY_COUNT", "2");
    // spoofed, real client (added by CDN), CDN edge (added by Caddy)
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.42, 172.68.1.1" });
    expect(getTrustedProxyClientIP(headers)).toBe("203.0.113.42");
  });

  it("uses the leftmost hop when the chain is shorter than configured", () => {
    expect(getTrustedProxyClientIP(new Headers({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
  });

  it("ignores invalid values", () => {
    for (const value of ["0", "-1", "abc", "1.5", "99"]) {
      vi.stubEnv("TRUSTED_PROXY_COUNT", value);
      expect(getTrustedProxyCount()).toBe(1);
    }
  });
});
