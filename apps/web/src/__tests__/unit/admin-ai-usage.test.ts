/**
 * GET /api/admin/ai-usage (admin gate) and the model price config used for
 * its rough cost estimate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const getAiUsageReport = vi.fn();
vi.mock("@/lib/ai/usage-report", () => ({
  getAiUsageReport: (...a: unknown[]) => getAiUsageReport(...a),
}));

import { GET } from "@/app/api/admin/ai-usage/route";
import { estimateCostUsd, getModelPrices } from "@/lib/ai/model-prices";

const ORIGINAL_ADMINS = process.env.ADMIN_EMAILS;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.ADMIN_EMAILS = "owner@example.com";
});

afterEach(() => {
  process.env.ADMIN_EMAILS = ORIGINAL_ADMINS;
  delete process.env.AI_MODEL_PRICES_JSON;
});

describe("GET /api/admin/ai-usage", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(getAiUsageReport).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admins", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "someone@example.com", emailVerified: true } });
    expect((await GET()).status).toBe(403);
    expect(getAiUsageReport).not.toHaveBeenCalled();
  });

  it("returns 403 for an allow-listed but unverified address", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "owner@example.com", emailVerified: false } });
    expect((await GET()).status).toBe(403);
    expect(getAiUsageReport).not.toHaveBeenCalled();
  });

  it("returns the report for verified admins", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "Owner@Example.com", emailVerified: true } });
    getAiUsageReport.mockResolvedValue({ today: { calls: 4 }, last7d: { calls: 20 } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ today: { calls: 4 }, last7d: { calls: 20 } });
  });

  it("returns 500 when the report query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getSession.mockResolvedValue({ user: { id: "u1", email: "owner@example.com", emailVerified: true } });
    getAiUsageReport.mockRejectedValue(new Error('relation "ai_traces" does not exist'));
    expect((await GET()).status).toBe(500);
    error.mockRestore();
  });
});

describe("model prices", () => {
  it("has no prices unless configured (no unverified claims)", () => {
    expect(getModelPrices()).toEqual({});
    expect(estimateCostUsd(getModelPrices(), "gemini", "gemini-2.5-flash", 1000, 1000)).toBeNull();
  });

  it("reads AI_MODEL_PRICES_JSON and ignores invalid entries", () => {
    process.env.AI_MODEL_PRICES_JSON = JSON.stringify({
      "m-1": { input: 1, output: 4 },
      bad: { input: "x", output: 1 },
      neg: { input: -1, output: 1 },
    });
    const prices = getModelPrices();
    expect(Object.keys(prices)).toEqual(["m-1"]);
    expect(estimateCostUsd(prices, "openai", "m-1", 2_000_000, 500_000)).toBe(4);
  });

  it("treats malformed JSON as unconfigured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AI_MODEL_PRICES_JSON = "{nope";
    expect(getModelPrices()).toEqual({});
    warn.mockRestore();
  });

  it("local Ollama models cost nothing", () => {
    expect(estimateCostUsd({}, "ollama", "llama3.1", 10_000, 10_000)).toBe(0);
  });
});
