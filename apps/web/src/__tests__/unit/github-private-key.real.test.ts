import { afterEach, describe, expect, it, vi } from "vitest";
import { githubPrivateKey } from "@/lib/integrations/providers/github-client";

const PEM = "-----BEGIN RSA PRIVATE KEY-----\nabc123\ndef456\n-----END RSA PRIVATE KEY-----\n";

afterEach(() => vi.unstubAllEnvs());

describe("githubPrivateKey", () => {
  it("returns a raw multi-line PEM unchanged", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", PEM);
    expect(githubPrivateKey()).toBe(PEM.trim());
  });

  it("expands literal \\n escapes", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", PEM.trim().replace(/\n/g, "\\n"));
    expect(githubPrivateKey()).toBe(PEM.trim());
  });

  it("decodes a base64-encoded PEM", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", Buffer.from(PEM).toString("base64"));
    expect(githubPrivateKey()).toBe(PEM);
  });

  it("decodes a base64-encoded PEM that contains literal \\n escapes", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", Buffer.from(PEM.trim().replace(/\n/g, "\\n")).toString("base64"));
    expect(githubPrivateKey()).toBe(PEM.trim());
  });

  it("throws when unset", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(() => githubPrivateKey()).toThrow(/not configured/);
  });
});
