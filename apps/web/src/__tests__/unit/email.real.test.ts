/**
 * Real unit tests for the transactional email helper (lib/email).
 *
 * Guards the behavior auth relies on: configured detection, the no-provider
 * fallback (log, never throw — so auth flows aren't broken), the Resend HTTP
 * call when a key is present, and error propagation on a failed send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isEmailConfigured, sendEmail, actionEmailHtml } from "@/lib/email";

const ORIGINAL_FETCH = global.fetch;
const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (saved.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = saved.from;
});

describe("isEmailConfigured", () => {
  it("reflects RESEND_API_KEY presence", () => {
    expect(isEmailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sendEmail", () => {
  it("logs and does not throw or call the network when no provider is set", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>", text: "x" })
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("POSTs to the Resend API with the configured sender when a key is set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Nexus <hi@nexus.dev>";
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as never;

    await sendEmail({ to: "a@b.com", subject: "Verify", html: "<p>v</p>", text: "v" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({ to: "a@b.com", subject: "Verify", from: "Nexus <hi@nexus.dev>" });
  });

  it("throws when the provider rejects the send", async () => {
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = vi.fn(async () => new Response("nope", { status: 422 })) as never;
    await expect(sendEmail({ to: "a@b.com", subject: "x", html: "x" })).rejects.toThrow(/Email send failed: 422/);
  });
});

describe("actionEmailHtml", () => {
  it("embeds the heading, label and url", () => {
    const html = actionEmailHtml({ heading: "Doğrula", body: "b", ctaLabel: "Tıkla", url: "https://x/verify?t=1" });
    expect(html).toContain("Doğrula");
    expect(html).toContain("Tıkla");
    expect(html).toContain("https://x/verify?t=1");
  });
});
