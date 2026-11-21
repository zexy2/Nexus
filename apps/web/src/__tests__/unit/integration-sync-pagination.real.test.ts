/**
 * Provider sync lists follow pagination past the first 100 items, every
 * provider request carries a timeout signal, and bursts of webhook-triggered
 * syncs for one integration are coalesced.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_MAX_PAGES,
  getGitHubRepositoryData,
  parseGitHubNextLink,
} from "@/lib/integrations/providers/github-client";
import { listLinearIssues } from "@/lib/integrations/providers/linear-client";
import { resetCoalescedSchedules, scheduleCoalesced } from "@/lib/integrations/sync-coalescer";

const API = "https://api.github.com/repos/acme/app";

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function issues(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: from + index,
    number: from + index,
    title: `Issue ${from + index}`,
    body: null,
    state: "open",
    html_url: `https://github.com/acme/app/issues/${from + index}`,
    labels: [],
    updated_at: "2026-11-01T00:00:00Z",
  }));
}

function pulls(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: 10_000 + from + index,
    number: from + index,
    title: `PR ${from + index}`,
    body: null,
    state: "open",
    html_url: `https://github.com/acme/app/pull/${from + index}`,
    head: { ref: `branch-${from + index}`, sha: "a".repeat(40) },
    base: { ref: "main" },
    merged_at: null,
    updated_at: "2026-11-01T00:00:00Z",
  }));
}

const next = (url: string) => ({ link: `<${url}>; rel="next", <${url}>; rel="last"` });

beforeEach(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  vi.stubEnv("GITHUB_APP_ID", "1");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_SLUG", "nexus");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GitHub repository sync", () => {
  it("webhook sync paginates >100", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const url = String(input);
      if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
      if (url === API) {
        return json({ id: 1, full_name: "acme/app", name: "app", private: false, default_branch: "main", html_url: "https://github.com/acme/app", owner: { login: "acme" } });
      }
      if (url.startsWith(`${API}/issues`)) {
        return url.includes("page=2") ? json(issues(101, 50)) : json(issues(1, 100), next(`${API}/issues?state=all&per_page=100&page=2`));
      }
      if (url.startsWith(`${API}/pulls?`)) {
        return url.includes("page=2") ? json(pulls(101, 20)) : json(pulls(1, 100), next(`${API}/pulls?state=all&per_page=100&page=2`));
      }
      if (/\/pulls\/\d+\/files/.test(url)) return json([{ filename: "src/index.ts" }]);
      if (url.includes("/check-runs")) return json({ check_runs: [] });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await getGitHubRepositoryData({ installationId: "99", owner: "acme", repo: "app" });

    expect(data.issues).toHaveLength(150);
    expect(data.pullDetails).toHaveLength(120);
    expect(data.pullDetails[119]).toMatchObject({ pullRequest: { number: 120 }, files: ["src/index.ts"] });
    const listedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(listedUrls.filter((url) => url.startsWith(`${API}/issues`))).toHaveLength(2);
    expect(listedUrls.some((url) => url.includes("sort=updated&direction=desc"))).toBe(true);
  });

  it("stops at the page cap", async () => {
    let issuePages = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
      if (url === API) {
        return json({ id: 1, full_name: "acme/app", name: "app", private: false, default_branch: "main", html_url: "x", owner: { login: "acme" } });
      }
      if (url.startsWith(`${API}/issues`)) {
        issuePages += 1;
        return json(issues(issuePages * 100, 100), next(`${API}/issues?page=${issuePages + 1}`));
      }
      return json([]);
    }));

    const data = await getGitHubRepositoryData({ installationId: "99", owner: "acme", repo: "app" });
    expect(issuePages).toBe(GITHUB_MAX_PAGES);
    expect(data.issues).toHaveLength(GITHUB_MAX_PAGES * 100);
  });

  it("only follows next links on api.github.com", () => {
    expect(parseGitHubNextLink('<https://api.github.com/x?page=2>; rel="next"')).toBe("https://api.github.com/x?page=2");
    expect(parseGitHubNextLink('<https://evil.example/x?page=2>; rel="next"')).toBeNull();
    expect(parseGitHubNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(parseGitHubNextLink(null)).toBeNull();
  });
});

describe("Linear issue sync", () => {
  it("webhook sync paginates >100 Linear issues via cursors", async () => {
    const node = (index: number) => ({
      id: `issue-${index}`,
      identifier: `NEX-${index}`,
      title: `Issue ${index}`,
      description: null,
      url: `https://linear.app/x/NEX-${index}`,
      priority: 0,
      updatedAt: "2026-11-01T00:00:00Z",
      state: { name: "Todo" },
      team: { id: "team-1", key: "NEX", name: "Nexus" },
      project: null,
      labels: { nodes: [] },
    });
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const { variables } = JSON.parse(String(init?.body));
      if (!variables.after) {
        return json({ data: { issues: { nodes: Array.from({ length: 100 }, (_, i) => node(i)), pageInfo: { hasNextPage: true, endCursor: "cursor-1" } } } });
      }
      expect(variables.after).toBe("cursor-1");
      return json({ data: { issues: { nodes: Array.from({ length: 30 }, (_, i) => node(100 + i)), pageInfo: { hasNextPage: false, endCursor: "cursor-2" } } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listLinearIssues("linear-token", { teamId: "team-1" });
    expect(result).toHaveLength(130);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("sync coalescing", () => {
  beforeEach(() => resetCoalescedSchedules());

  it("runs at most one sync per integration and one trailing sync for a burst", async () => {
    const releases: Array<() => void> = [];
    const run = vi.fn(() => new Promise<string>((resolve) => releases.push(() => resolve(`run-${releases.length}`))));

    const first = scheduleCoalesced("integration-1", run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    // Burst arrives while the first sync is running: they share one trailing run.
    const burst = [scheduleCoalesced("integration-1", run), scheduleCoalesced("integration-1", run), scheduleCoalesced("integration-1", run)];
    expect(burst[0]).toBe(burst[1]);
    expect(burst[1]).toBe(burst[2]);
    expect(run).toHaveBeenCalledTimes(1);

    releases[0]!();
    await first;
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    releases[1]!();
    await Promise.all(burst);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
