import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/integrations/crypto";

type StateRow = {
  id: string;
  provider: "github" | "linear";
  workspaceId: string;
  userId: string;
  stateHash: string;
  metadata: Record<string, unknown>;
  expiresAt: Date;
  consumedAt: Date | null;
};

// In-memory stand-in for integration_connect_states that honours the
// one-time/expiry predicate of the atomic consume UPDATE.
const store = vi.hoisted(() => ({
  rows: [] as StateRow[],
  integrationInserts: [] as Array<Record<string, unknown>>,
  verifySession: vi.fn(),
  requireWorkspaceOwner: vi.fn(),
}));

function findByHashAndProvider() {
  return store.rows[0];
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      integrationConnectStates: {
        findFirst: async () => findByHashAndProvider(),
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          const apply = () => {
            const row = findByHashAndProvider();
            if (!row) return [];
            if ("consumedAt" in values) {
              if (row.consumedAt || row.expiresAt.getTime() <= Date.now()) return [];
              row.consumedAt = values.consumedAt as Date;
              return [{ ...row }];
            }
            Object.assign(row, values);
            return [{ ...row }];
          };
          const result = Promise.resolve().then(apply);
          return Object.assign(result, { returning: () => result });
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          store.integrationInserts.push(values);
        },
      }),
    }),
  },
}));

vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...args: unknown[]) => store.verifySession(...args),
}));

vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceOwner: (...args: unknown[]) => store.requireWorkspaceOwner(...args),
}));

vi.mock("@/lib/integrations/providers/linear-client", () => ({
  exchangeLinearOAuthCode: vi.fn(async () => "cipher"),
  resolveLinearAccessToken: vi.fn(async () => ({ accessToken: "lin-token", encrypted: "cipher" })),
  getLinearViewer: vi.fn(async () => ({
    viewer: { id: "v1", name: "Victim", email: "v@x.com", organization: { id: "org-1", name: "Org" } },
  })),
  listLinearResources: vi.fn(async () => ({ teams: [{ id: "team-1" }], projects: [] })),
}));

const github = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/integrations/providers/github-client", () => ({
  getGitHubAppConfig: () => ({ appId: "1", appSlug: "nexus-app", clientId: "client" }),
  exchangeGitHubOAuthCode: (...a: unknown[]) => github.exchange(...a),
  verifyGitHubInstallationForUser: (...a: unknown[]) => github.verify(...a),
  listGitHubInstallationsForUser: (...a: unknown[]) => github.list(...a),
}));

import { GET as linearCallback } from "@/app/api/integrations/linear/callback/route";
import { GET as githubCallback } from "@/app/api/integrations/github/callback/route";
import { GET as githubSetup } from "@/app/api/integrations/github/setup/route";
import { authorizeIntegrationConnectState } from "@/lib/integrations/connect-state-guard";

const STATE = "state-token-abc";

function seedState(overrides: Partial<StateRow> = {}) {
  store.rows = [
    {
      id: "state-1",
      provider: "linear",
      workspaceId: "ws-attacker",
      userId: "user-owner",
      stateHash: sha256Hex(STATE),
      metadata: {},
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      ...overrides,
    },
  ];
}

function sessionFor(userId: string) {
  store.verifySession.mockResolvedValue({
    user: { id: userId, email: `${userId}@x.com`, name: userId },
    session: { id: `s-${userId}`, expiresAt: new Date(Date.now() + 60_000) },
  });
}

function callbackRequest(provider: "linear" | "github", state = STATE) {
  return new NextRequest(
    `http://localhost:3000/api/integrations/${provider}/callback?code=code-1&state=${state}`
  );
}

function errorOf(response: Response) {
  const location = response.headers.get("location") || "";
  return new URL(location).searchParams.get("error");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.rows = [];
  store.integrationInserts = [];
  store.requireWorkspaceOwner.mockResolvedValue({ ok: true, workspaceId: "ws-attacker" });
  github.exchange.mockResolvedValue("gh-user-token");
  github.verify.mockResolvedValue({ id: 42, account: { login: "victim-org" } });
  github.list.mockResolvedValue([{ id: 42, app_id: 1, app_slug: "nexus-app", account: { login: "owner-org" } }]);
});

describe("Linear OAuth callback state binding", () => {
  it("rejects a state created by a different user (linking CSRF) and leaves it unconsumed", async () => {
    seedState({ userId: "user-attacker" });
    sessionFor("user-victim");

    const response = await linearCallback(callbackRequest("linear"));

    expect(errorOf(response)).toBe("state_user_mismatch");
    expect(store.integrationInserts).toHaveLength(0);
    expect(store.rows[0].consumedAt).toBeNull();
  });

  it("rejects the callback without a session", async () => {
    seedState();
    store.verifySession.mockResolvedValue(null);

    const response = await linearCallback(callbackRequest("linear"));

    expect(errorOf(response)).toBe("not_authenticated");
    expect(store.integrationInserts).toHaveLength(0);
  });

  it("rejects when the user no longer owns the target workspace", async () => {
    seedState();
    sessionFor("user-owner");
    store.requireWorkspaceOwner.mockResolvedValue({ ok: false, status: 403, error: "Workspace owner access required" });

    const response = await linearCallback(callbackRequest("linear"));

    expect(errorOf(response)).toBe("workspace_access_denied");
    expect(store.integrationInserts).toHaveLength(0);
  });

  it("rejects an expired state", async () => {
    seedState({ expiresAt: new Date(Date.now() - 1000) });
    sessionFor("user-owner");

    const response = await linearCallback(callbackRequest("linear"));

    expect(errorOf(response)).toBe("invalid_state");
    expect(store.integrationInserts).toHaveLength(0);
  });

  it("accepts the valid flow once and rejects a replay of the same state", async () => {
    seedState();
    sessionFor("user-owner");

    const first = await linearCallback(callbackRequest("linear"));
    expect(new URL(first.headers.get("location")!).searchParams.get("connected")).toBe("true");
    expect(store.integrationInserts).toHaveLength(1);
    expect(store.integrationInserts[0]).toMatchObject({ workspaceId: "ws-attacker", createdBy: "user-owner" });
    expect(store.requireWorkspaceOwner).toHaveBeenCalledWith("user-owner", "ws-attacker");

    const replay = await linearCallback(callbackRequest("linear"));
    expect(errorOf(replay)).toBe("invalid_state");
    expect(store.integrationInserts).toHaveLength(1);
  });
});

describe("GitHub OAuth callback state binding", () => {
  it("rejects a state created by a different user before exchanging the code", async () => {
    seedState({ provider: "github", userId: "user-attacker" });
    sessionFor("user-victim");

    const response = await githubCallback(callbackRequest("github"));

    expect(errorOf(response)).toBe("state_user_mismatch");
    expect(github.exchange).not.toHaveBeenCalled();
    expect(store.integrationInserts).toHaveLength(0);
  });

  it("accepts the valid flow once and rejects a replay", async () => {
    seedState({ provider: "github", metadata: { githubInstallationId: "42" } });
    sessionFor("user-owner");

    const first = await githubCallback(callbackRequest("github"));
    expect(new URL(first.headers.get("location")!).searchParams.get("connected")).toBe("true");
    expect(store.integrationInserts).toHaveLength(1);
    expect(store.integrationInserts[0]).toMatchObject({ workspaceId: "ws-attacker", installationId: "42" });

    const replay = await githubCallback(callbackRequest("github"));
    expect(errorOf(replay)).toBe("invalid_state");
    expect(store.integrationInserts).toHaveLength(1);
  });

  it("does not link when the state is consumed concurrently between check and write", async () => {
    seedState({ provider: "github" });
    sessionFor("user-owner");
    github.list.mockImplementation(async () => {
      store.rows[0].consumedAt = new Date(); // a parallel callback won the claim
      return [{ id: 42, app_id: 1, app_slug: "nexus-app", account: { login: "owner-org" } }];
    });

    const response = await githubCallback(callbackRequest("github"));

    expect(errorOf(response)).toBe("invalid_state");
    expect(store.integrationInserts).toHaveLength(0);
  });

  it("setup step refuses to attach an installation to another user's state", async () => {
    seedState({ provider: "github", userId: "user-attacker" });
    sessionFor("user-victim");

    const response = await githubSetup(
      new NextRequest(
        `http://localhost:3000/api/integrations/github/setup?state=${STATE}&installation_id=99`
      )
    );

    expect(response.status).toBe(403);
    expect(store.rows[0].metadata).toEqual({});
  });
});

describe("authorizeIntegrationConnectState", () => {
  it("rejects an already consumed state", async () => {
    seedState({ consumedAt: new Date() });
    sessionFor("user-owner");

    await expect(authorizeIntegrationConnectState("linear", STATE, { consume: true })).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
  });
});
