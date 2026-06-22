import { afterEach, describe, expect, it } from "vitest";
import {
  getDemoSessionPolicy,
  isEphemeralDemoEmail,
  secureAccessCodeMatches,
} from "@/lib/demo-sessions";

const originalTtl = process.env.DEMO_SESSION_TTL_MINUTES;
const originalCapacity = process.env.DEMO_MAX_ACTIVE_SESSIONS;

afterEach(() => {
  if (originalTtl === undefined) delete process.env.DEMO_SESSION_TTL_MINUTES;
  else process.env.DEMO_SESSION_TTL_MINUTES = originalTtl;

  if (originalCapacity === undefined) delete process.env.DEMO_MAX_ACTIVE_SESSIONS;
  else process.env.DEMO_MAX_ACTIVE_SESSIONS = originalCapacity;
});

describe("isolated demo session policy", () => {
  it("recognizes only the reserved ephemeral demo domain", () => {
    expect(isEphemeralDemoEmail("demo-123@sessions.nexus.invalid")).toBe(true);
    expect(isEphemeralDemoEmail("DEMO-123@SESSIONS.NEXUS.INVALID")).toBe(true);
    expect(isEphemeralDemoEmail("visitor@example.com")).toBe(false);
    expect(isEphemeralDemoEmail("demo@sessions.nexus.invalid.attacker.com")).toBe(false);
  });

  it("compares access codes without accepting prefixes or length mismatches", () => {
    expect(secureAccessCodeMatches("portfolio-2026", "portfolio-2026")).toBe(true);
    expect(secureAccessCodeMatches("portfolio-2026", "portfolio")).toBe(false);
    expect(secureAccessCodeMatches("portfolio-2026", "portfolio-2027")).toBe(false);
  });

  it("uses bounded defaults and ignores invalid environment values", () => {
    process.env.DEMO_SESSION_TTL_MINUTES = "invalid";
    process.env.DEMO_MAX_ACTIVE_SESSIONS = "-1";
    expect(getDemoSessionPolicy()).toEqual({ ttlMinutes: 60, maxActiveSessions: 25 });

    process.env.DEMO_SESSION_TTL_MINUTES = "30";
    process.env.DEMO_MAX_ACTIVE_SESSIONS = "10";
    expect(getDemoSessionPolicy()).toEqual({ ttlMinutes: 30, maxActiveSessions: 10 });
  });
});
