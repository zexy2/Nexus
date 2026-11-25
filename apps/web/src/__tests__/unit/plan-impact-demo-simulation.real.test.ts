/**
 * persistPlanImpact flags external proposals against seeded demo-only
 * integrations as simulated, and leaves real integrations untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall = { text: string; values: unknown[] };

const mockState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  integrations: [] as Array<{ id: string; provider: string; metadata: Record<string, unknown> | null }>,
  postgres: vi.fn(),
}));

function makeSqlClient() {
  const sql = Object.assign(
    async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const text = strings.join("?");
      mockState.calls.push({ text, values });
      if (text.includes("INSERT INTO plan_versions")) return [{ id: "pv-2" }] as T;
      if (text.includes("INSERT INTO requirements")) return [{ id: `req-${mockState.calls.length}` }] as T;
      if (text.includes("FROM workspace_integrations")) return mockState.integrations as T;
      if (text.includes("INSERT INTO change_sets")) return [{ id: "cs-new" }] as T;
      return [] as T;
    },
    {
      begin: async <T>(callback: (transaction: typeof sql) => Promise<T>) => callback(sql),
      end: vi.fn(),
    }
  );
  return sql;
}

vi.mock("postgres", () => ({ default: mockState.postgres }));

import { persistPlanImpact } from "../../../../../packages/workflows/src/activities";

const analysis = {
  docId: "doc-1",
  workspaceId: "ws-1",
  userId: "user-1",
  title: "Customer Order Tracking App",
  content: [],
  contentText: "Customer Order Tracking App REQ-006 Push notifications",
  baseVersionId: null,
  nextVersionNumber: 2,
  summary: "Added push notifications.",
  requirements: [
    {
      stableKey: "REQ-006",
      title: "Push notifications",
      description: "Notify when out for delivery.",
      acceptanceCriteria: ["A push is sent"],
      changeType: "added" as const,
      confidence: 90,
    },
  ],
  proposals: [],
  steps: [],
};

function insertedProposalMetadata() {
  return mockState.calls
    .filter((call) => call.text.includes("INSERT INTO change_proposals"))
    .map((call) => {
      const action = call.values[4];
      const metadata = JSON.parse(String(call.values[call.values.length - 1]));
      return { action, metadata };
    });
}

describe("persistPlanImpact demo simulation", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://nexus-test";
    mockState.calls.length = 0;
    mockState.postgres.mockImplementation(() => makeSqlClient());
  });

  it("marks GitHub issue proposals on a demo-only integration as simulated", async () => {
    mockState.integrations = [{ id: "gh-demo", provider: "github", metadata: { seeded: true, demoOnly: true } }];
    await persistPlanImpact(analysis, "wf-1");
    const proposals = insertedProposalMetadata();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.action).toBe("github_create_issue");
    expect(proposals[0]?.metadata).toMatchObject({ simulated: true, integrationId: "gh-demo" });
  });

  it("does not mark proposals on a real integration", async () => {
    mockState.integrations = [{ id: "gh-real", provider: "github", metadata: {} }];
    await persistPlanImpact(analysis, "wf-2");
    const proposals = insertedProposalMetadata();
    expect(proposals[0]?.metadata.simulated).toBeUndefined();
  });
});
