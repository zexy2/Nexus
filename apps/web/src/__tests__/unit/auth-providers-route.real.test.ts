import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/auth/providers/route";

const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
const originalGithubId = process.env.GITHUB_CLIENT_ID;
const originalGithubSecret = process.env.GITHUB_CLIENT_SECRET;

afterEach(() => {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("GOOGLE_CLIENT_ID", originalGoogleId);
  restore("GOOGLE_CLIENT_SECRET", originalGoogleSecret);
  restore("GITHUB_CLIENT_ID", originalGithubId);
  restore("GITHUB_CLIENT_SECRET", originalGithubSecret);
});

describe("GET /api/auth/providers", () => {
  it("does not advertise providers with missing credentials", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GITHUB_CLIENT_ID = "id";
    delete process.env.GITHUB_CLIENT_SECRET;

    expect(await GET().json()).toEqual({
      github: false,
      google: false,
    });
  });

  it("advertises only fully configured providers", async () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;

    expect(await GET().json()).toEqual({
      github: false,
      google: true,
    });
  });
});
