/**
 * Durability of approved external writes.
 *
 * Simulates the `external_write_operations` row in memory behind a fake
 * postgres tagged-template client, with a controllable clock, so the claim /
 * lease / fencing / finalize logic can be exercised without a database.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type OperationRow = {
  id: string;
  status: string;
  sync_status: string;
  attempt_count: number;
  attempted_at: number | null;
  updated_at: number;
  error: string | null;
};

const LEASE_MS = 120_000;

const state = vi.hoisted(() => ({
  now: 0,
  op: null as null | {
    id: string;
    status: string;
    sync_status: string;
    attempt_count: number;
    attempted_at: number | null;
    updated_at: number;
    error: string | null;
  },
  changeSetStatus: "external_pending",
  calls: [] as Array<{ text: string; values: unknown[] }>,
  postgres: (() => undefined) as unknown as (...args: unknown[]) => unknown,
}));

function isStale(row: OperationRow, field: "attempted_at" | "updated_at") {
  const at = field === "attempted_at" ? row.attempted_at ?? row.updated_at : row.updated_at;
  return at < state.now - LEASE_MS;
}

function leaseRemainingSeconds(row: OperationRow) {
  const at = row.status === "running" ? row.attempted_at ?? row.updated_at : row.updated_at;
  return Math.max(0, (at + LEASE_MS - state.now) / 1000);
}

function makeSqlClient() {
  const handle = (text: string, values: unknown[]): unknown[] => {
    state.calls.push({ text, values });
    const op = state.op as OperationRow;

    if (text.includes("FROM external_write_operations o")) {
      return [{
        id: op.id,
        workspace_id: "ws-1",
        change_set_id: "cs-1",
        change_proposal_id: "cp-1",
        integration_id: "int-1",
        provider: "github",
        operation_type: "github_create_issue",
        payload: { title: "Ship it" },
        status: op.status,
        sync_status: op.sync_status,
        sync_error: null,
        idempotency_key: "idem-1",
        created_by: "user-1",
        installation_id: "inst-1",
        token_ciphertext: null,
        integration_metadata: { selectedRepository: "acme/app" },
        requirement_id: "req-1",
      }];
    }
    if (text.includes("SET status = 'running'")) {
      const claimable =
        op.status === "pending" ||
        op.status === "failed_retryable" ||
        (op.status === "running" && isStale(op, "attempted_at"));
      if (!claimable) return [];
      op.status = "running";
      op.attempt_count += 1;
      op.attempted_at = state.now;
      op.updated_at = state.now;
      op.error = null;
      return [{ id: op.id, attempt_count: op.attempt_count }];
    }
    if (text.includes("lease_remaining_seconds") && text.includes("SELECT status")) {
      return [{ status: op.status, lease_remaining_seconds: leaseRemainingSeconds(op) }];
    }
    if (text.includes("SET status = 'succeeded'")) {
      const fence = values[values.length - 1];
      if (op.status !== "running" || op.attempt_count !== fence) return [];
      op.status = "succeeded";
      op.sync_status = "pending";
      op.updated_at = state.now;
      return [{ id: op.id }];
    }
    if (text.includes("UPDATE external_write_operations") && text.includes("AND attempt_count =")) {
      // fenced failure write: status, error, id, fence
      const fence = values[values.length - 1];
      if (op.status !== "running" || op.attempt_count !== fence) return [];
      op.status = values[0] as string;
      op.error = values[1] as string;
      op.updated_at = state.now;
      return [{ id: op.id }];
    }
    if (text.includes("AS stale")) {
      const field = op.status === "running" ? "attempted_at" : "updated_at";
      return [{
        id: op.id,
        status: op.status,
        sync_status: op.sync_status,
        stale: isStale(op, field),
        lease_remaining_seconds: leaseRemainingSeconds(op),
      }];
    }
    if (text.includes("SET status = 'failed_retryable'") && text.includes("status IN ('pending', 'running')")) {
      if (op.status === "pending" || op.status === "running") {
        op.status = "failed_retryable";
        op.error = values[0] as string;
      }
      return [];
    }
    if (text.includes("SET sync_status = 'failed_retryable'")) {
      if (op.sync_status === "pending" || op.sync_status === "running") op.sync_status = "failed_retryable";
      return [];
    }
    if (text.includes("UPDATE change_sets")) {
      state.changeSetStatus = values[0] as string;
      return [];
    }
    if (text.includes("FROM change_proposals") && text.includes("count(*)")) {
      return [{ count: 0 }];
    }
    if (text.includes("INSERT INTO external_issues")) {
      return [{ id: "ext-issue-1" }];
    }
    return [];
  };

  const sql = Object.assign(
    (stringsOrList: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      if (!("raw" in stringsOrList)) return { list: stringsOrList };
      return Promise.resolve(handle(stringsOrList.join("?"), values));
    },
    {
      begin: async <T>(callback: (tx: unknown) => Promise<T>) => callback(sql),
      end: async () => undefined,
    }
  );
  return sql;
}

vi.mock("postgres", () => ({
  default: (...args: unknown[]) => state.postgres(...args),
}));

import {
  EXTERNAL_WRITE_CLAIM_LEASE_SECONDS,
  EXTERNAL_WRITE_INTERRUPTED_MESSAGE,
  executeExternalWriteOperation,
  finalizeExternalWriteOperations,
  summarizeExternalOperationsForFinalize,
} from "../../../../../packages/workflows/src/activities";

type FetchCall = { url: string; method: string };
let fetchCalls: FetchCall[] = [];
let existingIssues: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.DATABASE_URL = "postgres://nexus-test";
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  state.now = 10_000_000;
  state.calls = [];
  state.changeSetStatus = "external_pending";
  state.postgres = () => makeSqlClient();
  fetchCalls = [];
  existingIssues = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method || "GET";
    fetchCalls.push({ url, method });
    if (url.includes("/access_tokens")) return jsonResponse({ token: "inst-token" });
    if (method === "GET" && url.includes("/issues?state=all")) return jsonResponse(existingIssues);
    if (method === "POST" && url.endsWith("/issues")) {
      return jsonResponse({ id: 99, number: 7, title: "Ship it", body: "created", html_url: "https://github.com/acme/app/issues/7", state: "open" }, 201);
    }
    return jsonResponse({}, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("external write lease", () => {
  it("keeps the lease longer than the 90 s activity startToCloseTimeout", () => {
    expect(EXTERNAL_WRITE_CLAIM_LEASE_SECONDS * 1000).toBe(LEASE_MS);
    expect(EXTERNAL_WRITE_CLAIM_LEASE_SECONDS).toBeGreaterThan(90);
  });
});

describe("executeExternalWriteOperation: crash after claim", () => {
  it("crash-after-claim recovers: a stale running claim is reclaimed and completed", async () => {
    // A previous attempt claimed the row and the worker died mid-call.
    state.op = {
      id: "op-1",
      status: "running",
      sync_status: "not_required",
      attempt_count: 1,
      attempted_at: state.now - LEASE_MS - 1_000,
      updated_at: state.now - LEASE_MS - 1_000,
      error: null,
    };

    const result = await executeExternalWriteOperation("op-1");

    expect(result).toMatchObject({ operationId: "op-1", status: "succeeded", alreadyCompleted: false });
    expect(state.op.status).toBe("succeeded");
    expect(state.op.attempt_count).toBe(2);
  });

  it("checks the provider marker before re-writing and reuses an issue the dead attempt created", async () => {
    state.op = {
      id: "op-1",
      status: "running",
      sync_status: "not_required",
      attempt_count: 1,
      attempted_at: state.now - LEASE_MS - 1_000,
      updated_at: state.now - LEASE_MS - 1_000,
      error: null,
    };
    existingIssues = [{
      id: 99,
      number: 7,
      title: "Ship it",
      body: "Created from a Nexus plan change.\n\n<!-- nexus-operation:idem-1 -->",
      state: "open",
    }];

    const result = await executeExternalWriteOperation("op-1");

    expect(result.status).toBe("succeeded");
    expect(fetchCalls.some((call) => call.method === "POST" && call.url.endsWith("/issues"))).toBe(false);
  });

  it("does not steal a live claim; asks Temporal to retry after the lease lapses", async () => {
    state.op = {
      id: "op-1",
      status: "running",
      sync_status: "not_required",
      attempt_count: 1,
      attempted_at: state.now - 30_000,
      updated_at: state.now - 30_000,
      error: null,
    };

    const error = await executeExternalWriteOperation("op-1").catch((caught) => caught);

    expect(error).toMatchObject({ type: "ExternalWriteInProgress", nonRetryable: false });
    expect(error.nextRetryDelay).toBe("91s");
    expect(state.op.attempt_count).toBe(1);
    expect(state.op.status).toBe("running");
    expect(fetchCalls).toHaveLength(0);
  });

  it("fences a zombie attempt: its late outcome cannot overwrite the reclaiming attempt", async () => {
    state.op = {
      id: "op-1",
      status: "pending",
      sync_status: "not_required",
      attempt_count: 0,
      attempted_at: null,
      updated_at: state.now,
      error: null,
    };
    // While the provider call is in flight, the lease lapses and another
    // attempt reclaims the row (attempt_count moves past our fence).
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method || "GET";
      if (url.includes("/access_tokens")) return jsonResponse({ token: "inst-token" });
      if (method === "GET") {
        (state.op as OperationRow).attempt_count += 1;
        return jsonResponse([]);
      }
      return jsonResponse({ id: 99, number: 7, title: "Ship it" }, 201);
    }));

    const result = await executeExternalWriteOperation("op-1");

    expect(result).toMatchObject({ status: "running", skipped: true, superseded: true });
    expect(state.op.status).toBe("running");
    expect(state.calls.some((call) => call.text.includes("INSERT INTO external_issues"))).toBe(false);
  });
});

describe("finalizeExternalWriteOperations", () => {
  it("finalize terminates: an interrupted claim becomes failed_retryable and the change set leaves external_pending", async () => {
    state.op = {
      id: "op-1",
      status: "running",
      sync_status: "not_required",
      attempt_count: 1,
      attempted_at: state.now - LEASE_MS - 1_000,
      updated_at: state.now - LEASE_MS - 1_000,
      error: null,
    };

    const result = await finalizeExternalWriteOperations("cs-1", "user-1");

    expect(result).toEqual({ succeeded: 0, failed: 1, status: "external_failed" });
    expect(state.op.status).toBe("failed_retryable");
    expect(state.op.error).toBe(EXTERNAL_WRITE_INTERRUPTED_MESSAGE);
    expect(state.changeSetStatus).toBe("external_failed");
    expect(state.calls.some((call) => call.values.includes("integration.write_interrupted"))).toBe(true);
  });

  it("finalize terminates: with a live claim it retries only until the lease lapses, then resolves", async () => {
    state.op = {
      id: "op-1",
      status: "running",
      sync_status: "not_required",
      attempt_count: 1,
      attempted_at: state.now - 60_000,
      updated_at: state.now - 60_000,
      error: null,
    };

    const error = await finalizeExternalWriteOperations("cs-1", "user-1").catch((caught) => caught);
    expect(error).toMatchObject({ type: "ExternalWritesInFlight", nonRetryable: false, nextRetryDelay: "61s" });
    expect(state.changeSetStatus).toBe("external_pending");

    // Temporal retries after nextRetryDelay; the claim never confirmed.
    state.now += 61_000;
    const result = await finalizeExternalWriteOperations("cs-1", "user-1");
    expect(result.status).toBe("external_failed");
    expect(state.op.status).toBe("failed_retryable");
  });

  it("marks an interrupted post-write provider refresh as a retryable sync failure", async () => {
    state.op = {
      id: "op-1",
      status: "succeeded",
      sync_status: "running",
      attempt_count: 1,
      attempted_at: state.now - LEASE_MS * 3,
      updated_at: state.now - LEASE_MS - 1_000,
      error: null,
    };

    const result = await finalizeExternalWriteOperations("cs-1", "user-1");

    expect(result.status).toBe("external_failed");
    expect(state.op.sync_status).toBe("failed_retryable");
  });

  it("applies when every write succeeded", async () => {
    state.op = {
      id: "op-1",
      status: "succeeded",
      sync_status: "succeeded",
      attempt_count: 1,
      attempted_at: state.now,
      updated_at: state.now,
      error: null,
    };

    await expect(finalizeExternalWriteOperations("cs-1", "user-1")).resolves.toEqual({
      succeeded: 1,
      failed: 0,
      status: "applied",
    });
  });
});

describe("summarizeExternalOperationsForFinalize", () => {
  it("classifies every row state", () => {
    const summary = summarizeExternalOperationsForFinalize([
      { id: "a", status: "succeeded", sync_status: "succeeded", stale: false, lease_remaining_seconds: 0 },
      { id: "b", status: "succeeded", sync_status: "not_required", stale: false, lease_remaining_seconds: 0 },
      { id: "c", status: "failed_terminal", sync_status: "not_required", stale: true, lease_remaining_seconds: 0 },
      { id: "d", status: "running", sync_status: "not_required", stale: true, lease_remaining_seconds: 0 },
      { id: "e", status: "running", sync_status: "not_required", stale: false, lease_remaining_seconds: 42.5 },
      { id: "f", status: "pending", sync_status: "not_required", stale: false, lease_remaining_seconds: 10 },
      { id: "g", status: "succeeded", sync_status: "pending", stale: true, lease_remaining_seconds: 0 },
      { id: "h", status: "succeeded", sync_status: "failed_retryable", stale: false, lease_remaining_seconds: 0 },
    ]);

    expect(summary).toEqual({
      succeeded: 2,
      failed: 4,
      inFlight: 2,
      retryAfterSeconds: 42.5,
      interruptedWriteIds: ["d"],
      interruptedSyncIds: ["g"],
    });
  });
});
