import { describe, expect, it } from "vitest";
import { demoLoginRateLimitPerMinute } from "./api-middleware";

describe("demoLoginRateLimitPerMinute", () => {
  const env = (v?: string) => ({ DEMO_SESSION_RATE_LIMIT_PER_MINUTE: v });

  it("defaults to 10 when unset, empty or invalid", () => {
    for (const v of [undefined, "", "abc", "0", "-3"]) expect(demoLoginRateLimitPerMinute(env(v))).toBe(10);
  });

  it("honours a positive integer", () => {
    expect(demoLoginRateLimitPerMinute(env("40"))).toBe(40);
  });
});
