/**
 * Retry-safety tests for Temporal activities.
 *
 * Temporal retries an activity whenever an attempt does not report success,
 * including when the attempt's database commit succeeded but the ack was lost
 * (worker crash, network drop). These tests simulate exactly that with an
 * in-memory stand-in for the postgres tagged-template client that supports
 * transactions (rollback on throw) and the unique keys the activities rely on.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

type DbState = {
  receipts: Record<string, { result: unknown }>;
  docs: Row[];
  tasks: Row[];
  planVersions: Row[];
  changeSets: Row[];
  proposals: Row[];
  auditEvents: string[];
  integrationToken: string | null;
};

function emptyState(): DbState {
  return {
    receipts: {},
    docs: [],
    tasks: [],
    planVersions: [],
    changeSets: [],
    proposals: [],
    auditEvents: [],
    integrationToken: null,
  };
}

const mock = vi.hoisted(() => ({
  db: null as unknown as DbState,
  calls: [] as Array<{ text: string; values: unknown[] }>,
  failTaskInsertAt: null as number | null,
  taskInsertAttempts: 0,
  operationRow: null as Row | null,
  activityInfo: null as null | { activityId: string; workflowExecution: { workflowId: string; runId: string } },
  postgres: (() => undefined) as (...args: unknown[]) => unknown,
}));

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function handle(text: string, values: unknown[]): Row[] {
  const db = mock.db;

  if (text.includes("INSERT INTO workflow_activity_receipts")) {
    const key = values[0] as string;
    if (db.receipts[key]) return [];
    db.receipts[key] = { result: null };
    return [{ idempotency_key: key }];
  }
  if (text.includes("SELECT result FROM workflow_activity_receipts")) {
    const receipt = db.receipts[values[0] as string];
    return receipt ? [{ result: receipt.result }] : [];
  }
  if (text.includes("UPDATE workflow_activity_receipts")) {
    db.receipts[values[1] as string] = { result: JSON.parse(values[0] as string) };
    return [];
  }

  if (text.includes("INSERT INTO docs")) {
    const id = nextId("doc");
    db.docs.push({ id, workspace_id: values[0], title: values[1] });
    return [{ id }];
  }
  if (text.includes("INSERT INTO tasks")) {
    mock.taskInsertAttempts++;
    if (mock.failTaskInsertAt !== null && mock.taskInsertAttempts === mock.failTaskInsertAt) {
      throw new Error("Connection terminated unexpectedly");
    }
    const id = nextId("task");
    db.tasks.push({ id, title: values[2] });
    return [{ id }];
  }
  if (text.includes("INSERT INTO audit_logs")) {
    db.auditEvents.push(String(values[2]));
    return [];
  }

  // persistPlanImpact
  if (text.includes("FROM change_sets cs")) {
    const changeSet = db.changeSets.find(
      (row) => row.temporal_workflow_id === values[0] && row.doc_id === values[1]
    );
    if (!changeSet) return [];
    const version = db.planVersions.find((row) => row.id === changeSet.proposed_version_id);
    return [{ ...changeSet, version_number: version?.version_number }];
  }
  if (text.includes("INSERT INTO plan_versions")) {
    if (db.planVersions.some((row) => row.doc_id === values[1] && row.version_number === values[2])) {
      throw new Error('duplicate key value violates unique constraint "plan_versions_doc_version_idx"');
    }
    const id = nextId("pv");
    db.planVersions.push({ id, doc_id: values[1], version_number: values[2] });
    return [{ id }];
  }
  if (text.includes("INSERT INTO requirements")) return [{ id: nextId("req") }];
  if (text.includes("INSERT INTO change_sets")) {
    const id = nextId("cs");
    db.changeSets.push({
      id,
      workspace_id: values[0],
      doc_id: values[1],
      proposed_version_id: values[3],
      temporal_workflow_id: values[4],
      status: values[5],
      summary: values[6],
      stats: JSON.parse(values[7] as string),
    });
    return [{ id }];
  }
  if (text.includes("INSERT INTO change_proposals")) {
    db.proposals.push({
      id: nextId("cp"),
      change_set_id: values[0],
      requirement_id: values[2],
      task_id: values[3],
      action: values[4],
      title: values[5],
      description: values[6],
      priority: values[7],
      rationale: values[8],
      status: "pending",
      metadata: JSON.parse(values[11] as string),
    });
    return [];
  }

  // applyPlanChangeSet
  if (text.includes("FROM change_sets") && text.includes("FOR UPDATE")) {
    return db.changeSets.filter((row) => row.id === values[0]);
  }
  if (text.includes("FROM change_proposals")) {
    return db.proposals.filter((row) => row.change_set_id === values[0] && row.status === "pending");
  }
  if (text.includes("UPDATE change_proposals") && text.includes("'applied'")) {
    const proposal = db.proposals.find((row) => row.id === values[values.length - 1]);
    if (proposal) proposal.status = "applied";
    return [];
  }
  if (text.includes("UPDATE change_sets")) {
    const changeSet = db.changeSets.find((row) => row.id === values[values.length - 1]);
    if (changeSet) changeSet.status = values[0];
    return [];
  }

  // External writes
  if (text.includes("FROM external_write_operations o")) {
    return mock.operationRow ? [{ ...mock.operationRow, token_ciphertext: db.integrationToken }] : [];
  }
  if (text.includes("SET status = 'running'")) return [{ id: mock.operationRow?.id }];
  if (text.includes("SELECT token_ciphertext")) return [{ token_ciphertext: db.integrationToken }];
  if (text.includes("UPDATE workspace_integrations") && text.includes("token_ciphertext")) {
    db.integrationToken = values[0] as string;
    return [];
  }

  return [];
}

function makeSqlClient() {
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      mock.calls.push({ text, values });
      return handle(text, values);
    },
    {
      begin: async <T>(callback: (transaction: typeof sql) => Promise<T>) => {
        const snapshot = structuredClone(mock.db);
        try {
          return await callback(sql);
        } catch (error) {
          mock.db = snapshot; // rollback
          throw error;
        }
      },
      end: vi.fn(),
    }
  );
  return sql;
}

vi.mock("postgres", () => ({
  default: (...args: unknown[]) => mock.postgres(...args),
}));

vi.mock("../../../../../packages/workflows/node_modules/@temporalio/activity", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Context: {
      current: () => {
        if (!mock.activityInfo) throw new Error("Activity context not initialized");
        return { info: mock.activityInfo };
      },
    },
  };
});

import {
  applyPlanChangeSet,
  executeExternalWriteOperation,
  externalErrorIsRetryable,
  linearOperationMarker,
  persistPlanImpact,
  providerRetryAfterMs,
  saveDocument,
  saveTasks,
} from "../../../../../packages/workflows/src/activities";

function inActivity(workflowId: string, activityId = "1") {
  mock.activityInfo = { activityId, workflowExecution: { workflowId, runId: "run-1" } };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://nexus-test";
  mock.db = emptyState();
  mock.calls = [];
  mock.failTaskInsertAt = null;
  mock.taskInsertAttempts = 0;
  mock.operationRow = null;
  mock.activityInfo = null;
  mock.postgres = () => makeSqlClient();
  idCounter = 0;
});

describe("saveTasks retry", () => {
  const tasks = [
    { title: "Task A", description: "a", priority: "high" },
    { title: "Task B", description: "b", priority: "low" },
    { title: "Task C", description: "c", priority: "medium" },
  ];

  it("retry of saveTasks after a committed attempt creates no duplicates and returns the same ids", async () => {
    inActivity("task-breakdown-1");
    const first = await saveTasks("ws-1", tasks, "user-1", "doc-1");
    // Ack lost: Temporal retries the same activity (same workflowId + activityId).
    const retry = await saveTasks("ws-1", tasks, "user-1", "doc-1");

    expect(retry).toEqual(first);
    expect(mock.db.tasks).toHaveLength(3);
    expect(mock.db.auditEvents.filter((event) => event === "task.create")).toHaveLength(3);
  });

  it("retry of saveTasks after a mid-loop failure creates no duplicates", async () => {
    inActivity("task-breakdown-2");
    mock.failTaskInsertAt = 3; // the DB drops while inserting the third task

    await expect(saveTasks("ws-1", tasks, "user-1")).rejects.toThrow("Connection terminated");
    expect(mock.db.tasks).toHaveLength(0); // the partial set was rolled back

    const retry = await saveTasks("ws-1", tasks, "user-1");
    expect(retry).toHaveLength(3);
    expect(mock.db.tasks.map((task) => task.title)).toEqual(["Task A", "Task B", "Task C"]);
  });

  it("a different workflow still creates its own tasks", async () => {
    inActivity("task-breakdown-3");
    await saveTasks("ws-1", tasks, "user-1");
    inActivity("task-breakdown-4");
    await saveTasks("ws-1", tasks, "user-1");
    expect(mock.db.tasks).toHaveLength(6);
  });
});

describe("saveDocument retry", () => {
  it("retry of saveDocument creates no duplicate document and returns the same id", async () => {
    inActivity("document-generation-1", "3");
    const first = await saveDocument("ws-1", "Spec", "Short body", "user-1");
    const retry = await saveDocument("ws-1", "Spec", "Short body", "user-1");

    expect(retry).toBe(first);
    expect(mock.db.docs).toHaveLength(1);
    expect(mock.db.auditEvents.filter((event) => event === "document.create")).toHaveLength(1);
  });
});

const analysis = {
  workspaceId: "ws-1",
  userId: "user-1",
  docId: "doc-1",
  title: "Plan",
  content: [],
  contentText: "Plan body",
  baseVersionId: null,
  nextVersionNumber: 2,
  summary: "One requirement added",
  requirements: [
    {
      stableKey: "REQ-1",
      title: "Login",
      description: "Users can log in",
      acceptanceCriteria: [],
      changeType: "added" as const,
      confidence: 90,
    },
  ],
  proposals: [
    {
      action: "create_task" as const,
      requirementStableKey: "REQ-1",
      title: "Build login",
      rationale: "New requirement",
      confidence: 90,
    },
  ],
  steps: [],
};

describe("persistPlanImpact retry", () => {
  it("persistPlanImpact retry after a committed attempt returns the same result", async () => {
    inActivity("plan-impact-1", "2");
    const first = await persistPlanImpact(analysis as never, "plan-impact-1");
    const retry = await persistPlanImpact(analysis as never, "plan-impact-1");

    expect(retry).toEqual(first);
    expect(mock.db.changeSets).toHaveLength(1);
    expect(mock.db.planVersions).toHaveLength(1);
    expect(mock.calls.filter((call) => call.text.includes("INSERT INTO plan_versions"))).toHaveLength(1);
  });
});

describe("applyPlanChangeSet retry", () => {
  it("applyPlanChangeSet retry after a committed attempt returns the same result", async () => {
    inActivity("plan-impact-2", "2");
    const persisted = await persistPlanImpact(analysis as never, "plan-impact-2");
    const proposalId = mock.db.proposals[0].id as string;

    inActivity("plan-impact-2", "5");
    const first = await applyPlanChangeSet(persisted.changeSetId, [proposalId], "user-1");
    expect(mock.db.changeSets[0].status).toBe("applied");

    const retry = await applyPlanChangeSet(persisted.changeSetId, [proposalId], "user-1");

    expect(retry).toEqual(first);
    expect(first.applied).toBe(1);
    expect(mock.db.tasks).toHaveLength(1);
  });

  it("another workflow still gets the conflict for an already resolved change set", async () => {
    inActivity("plan-impact-3", "2");
    const persisted = await persistPlanImpact(analysis as never, "plan-impact-3");
    const proposalId = mock.db.proposals[0].id as string;
    inActivity("plan-impact-3", "5");
    await applyPlanChangeSet(persisted.changeSetId, [proposalId], "user-1");

    inActivity("change-set-apply-other", "1");
    await expect(
      applyPlanChangeSet(persisted.changeSetId, [proposalId], "user-1")
    ).rejects.toThrow("Change set is already resolved");
  });
});

// ---------------------------------------------------------------------------
// External writes
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY = randomBytes(32);

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

function decrypt(encrypted: string) {
  const [, iv, tag, data] = encrypted.split(":");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  );
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function linearOperation(overrides: Row = {}) {
  return {
    id: "op-1",
    workspace_id: "ws-1",
    change_set_id: "cs-1",
    change_proposal_id: "cp-1",
    integration_id: "int-1",
    provider: "linear",
    operation_type: "linear_create_issue",
    payload: { teamId: "team-1", title: "REQ-1: Login", description: "Body" },
    status: "pending",
    sync_status: "not_required",
    sync_error: null,
    idempotency_key: "cs-1:cp-1:linear_create_issue",
    created_by: "user-1",
    installation_id: null,
    integration_metadata: {},
    requirement_id: null,
    ...overrides,
  };
}

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function installFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
  const graphqlCalls: GraphqlCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/graphql") && typeof init?.body === "string") {
      graphqlCalls.push(JSON.parse(init.body) as GraphqlCall);
    }
    return handler(url, init);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return graphqlCalls;
}

describe("Linear external writes", () => {
  beforeEach(() => {
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = ENCRYPTION_KEY.toString("base64");
    process.env.LINEAR_CLIENT_ID = "linear-client";
    process.env.LINEAR_CLIENT_SECRET = "linear-secret";
    mock.db.integrationToken = encrypt({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 60 * 60_000,
    });
  });

  it("Linear create retry returns the existing issue instead of creating a duplicate", async () => {
    const marker = linearOperationMarker("cs-1:cp-1:linear_create_issue");
    const existingIssue = {
      id: "lin-issue-1",
      identifier: "ENG-1",
      title: "REQ-1: Login",
      description: `Body\n\n${marker}`,
      url: "https://linear.app/x/issue/ENG-1",
    };
    const calls = installFetch((url) => {
      if (url.endsWith("/graphql")) {
        return jsonResponse({ data: { issues: { nodes: [existingIssue] } } });
      }
      return jsonResponse({}, 404);
    });
    mock.operationRow = linearOperation({ status: "failed_retryable" });

    const result = await executeExternalWriteOperation("op-1");

    expect(result.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("NexusFindIssue");
    expect(calls[0].variables).toMatchObject({ teamId: "team-1", marker });
    expect(calls.some((call) => call.query.includes("issueCreate"))).toBe(false);
    const succeeded = mock.calls.find((call) => call.text.includes("SET status = 'succeeded'"));
    expect(JSON.parse(succeeded?.values[0] as string)).toMatchObject({
      issueCreate: { issue: { id: "lin-issue-1" } },
    });
  });

  it("Linear create embeds the idempotency marker when no earlier attempt exists", async () => {
    const marker = linearOperationMarker("cs-1:cp-1:linear_create_issue");
    const calls = installFetch((url, init) => {
      const body = JSON.parse(String(init?.body)) as GraphqlCall;
      if (url.endsWith("/graphql") && body.query.includes("NexusFindIssue")) {
        return jsonResponse({ data: { issues: { nodes: [] } } });
      }
      return jsonResponse({
        data: { issueCreate: { success: true, issue: { id: "lin-issue-2", identifier: "ENG-2" } } },
      });
    });
    mock.operationRow = linearOperation();

    await executeExternalWriteOperation("op-1");

    const create = calls.find((call) => call.query.includes("issueCreate"));
    expect((create?.variables.input as Record<string, unknown>).description).toBe(`Body\n\n${marker}`);
  });

  it("Linear comment retry returns the existing comment", async () => {
    const calls = installFetch(() =>
      jsonResponse({ data: { issue: { comments: { nodes: [{ id: "comment-1", url: "u" }] } } } })
    );
    mock.operationRow = linearOperation({
      operation_type: "linear_comment",
      idempotency_key: "cs-1:cp-1:linear_comment",
      payload: { issueId: "lin-issue-1", body: "Plan changed" },
    });

    const result = await executeExternalWriteOperation("op-1");

    expect(result.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
    expect(calls.some((call) => call.query.includes("commentCreate"))).toBe(false);
  });

  it("refreshed Linear token is persisted even when the write fails", async () => {
    mock.db.integrationToken = encrypt({
      accessToken: "access-old",
      refreshToken: "refresh-old",
      expiresAt: Date.now() - 1_000,
    });
    installFetch((url) => {
      if (url.endsWith("/oauth/token")) {
        return jsonResponse({ access_token: "access-new", refresh_token: "refresh-new", expires_in: 3600 });
      }
      return jsonResponse({ errors: [{ message: "Argument Validation Error" }] }, 400);
    });
    mock.operationRow = linearOperation();

    await expect(executeExternalWriteOperation("op-1")).rejects.toThrow("Argument Validation Error");

    const stored = decrypt(mock.db.integrationToken as string);
    expect(stored).toMatchObject({ accessToken: "access-new", refreshToken: "refresh-new" });
    const failed = mock.calls.find((call) => call.text.includes("UPDATE external_write_operations") && call.values.includes("failed_terminal"));
    expect(failed).toBeDefined();
  });

  it("uses a token another worker already rotated instead of refreshing again", async () => {
    const stale = encrypt({ accessToken: "access-old", refreshToken: "refresh-old", expiresAt: Date.now() - 1_000 });
    const rotated = encrypt({ accessToken: "access-rotated", refreshToken: "refresh-rotated", expiresAt: Date.now() + 3_600_000 });
    const calls = installFetch((url) => {
      if (url.endsWith("/oauth/token")) throw new Error("refresh must not be called");
      return jsonResponse({ data: { issues: { nodes: [{ id: "lin-issue-1" }] } } });
    });
    mock.operationRow = linearOperation();
    mock.db.integrationToken = rotated;
    // This worker read the operation row (with the stale token) before
    // another worker committed its refresh.
    const originalHandle = mock.postgres;
    let firstSelect = true;
    mock.postgres = () => {
      const client = originalHandle() as ReturnType<typeof makeSqlClient>;
      return Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const rows = (await client(strings, ...values)) as Row[];
        if (firstSelect && strings.join("?").includes("FROM external_write_operations o")) {
          firstSelect = false;
          return rows.map((row) => ({ ...row, token_ciphertext: stale }));
        }
        return rows;
      }, { begin: client.begin, end: client.end });
    };

    const result = await executeExternalWriteOperation("op-1");

    expect(result.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
    expect(mock.db.integrationToken).toBe(rotated);
  });

  it("Linear RATELIMITED → retryable failed_retryable status", async () => {
    installFetch(() =>
      jsonResponse(
        { errors: [{ message: "Rate limit exceeded", extensions: { code: "RATELIMITED" } }] },
        400,
        { "x-ratelimit-requests-reset": String(Date.now() + 30_000) }
      )
    );
    mock.operationRow = linearOperation();

    const error = await executeExternalWriteOperation("op-1").catch((caught: unknown) => caught);

    expect(externalErrorIsRetryable(error)).toBe(true);
    expect((error as { nextRetryDelay?: number }).nextRetryDelay).toBeGreaterThan(20_000);
    const failed = mock.calls.find((call) => call.text.includes("UPDATE external_write_operations") && call.values.includes("failed_retryable"));
    expect(failed).toBeDefined();
  });
});

describe("provider rate limits", () => {
  it("429 → retryable", () => {
    expect(externalErrorIsRetryable(Object.assign(new Error("limited"), { status: 429 }))).toBe(true);
    expect(
      externalErrorIsRetryable(Object.assign(new Error("Linear token refresh failed"), { status: 429, rateLimited: true }))
    ).toBe(true);
  });

  it("GitHub rate-limit 403 → retryable with retry-after delay", async () => {
    mock.operationRow = {
      ...linearOperation(),
      provider: "github",
      operation_type: "github_issue_comment",
      installation_id: "inst-1",
      integration_metadata: { selectedRepository: "acme/app" },
      payload: { issueNumber: 7, body: "Plan changed" },
    };
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = (await import("node:crypto"))
      .generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs1", format: "pem" })
      .toString();
    installFetch(() =>
      jsonResponse(
        { message: "You have exceeded a secondary rate limit." },
        403,
        { "retry-after": "60" }
      )
    );

    const error = await executeExternalWriteOperation("op-1").catch((caught: unknown) => caught);

    expect(externalErrorIsRetryable(error)).toBe(true);
    expect((error as { nextRetryDelay?: number }).nextRetryDelay).toBe(60_000);
    expect(mock.calls.some((call) => call.values.includes("failed_retryable"))).toBe(true);
  });

  it("plain 403 without rate-limit signals stays terminal", () => {
    expect(externalErrorIsRetryable(Object.assign(new Error("forbidden"), { status: 403 }))).toBe(false);
  });

  it("parses retry-after seconds, HTTP dates and reset headers", () => {
    const now = 1_000_000_000_000;
    expect(providerRetryAfterMs(new Headers({ "retry-after": "5" }), now)).toBe(5_000);
    expect(
      providerRetryAfterMs(new Headers({ "retry-after": new Date(now + 10_000).toUTCString() }), now)
    ).toBe(10_000);
    expect(providerRetryAfterMs(new Headers({ "x-ratelimit-reset": String(now / 1000 + 120) }), now)).toBe(120_000);
    expect(providerRetryAfterMs(new Headers({ "retry-after": "86400" }), now)).toBe(15 * 60_000);
    expect(providerRetryAfterMs(new Headers(), now)).toBeUndefined();
  });
});

describe("GitHub repository not configured", () => {
  it("no repo configured → permanent, user-actionable failure", async () => {
    mock.operationRow = {
      ...linearOperation(),
      provider: "github",
      operation_type: "github_create_issue",
      installation_id: "inst-1",
      integration_metadata: {},
      payload: { title: "REQ-1" },
    };
    installFetch(() => jsonResponse({}, 500));

    const error = await executeExternalWriteOperation("op-1").catch((caught: unknown) => caught);

    expect((error as Error).message).toBe("Select a GitHub repository before applying writes");
    expect((error as { nonRetryable?: boolean }).nonRetryable).toBe(true);
    expect(externalErrorIsRetryable(new Error("Select a GitHub repository before applying writes"))).toBe(false);
    expect(mock.calls.some((call) => call.values.includes("failed_terminal"))).toBe(true);
  });
});
