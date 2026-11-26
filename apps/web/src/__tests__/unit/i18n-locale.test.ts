import { describe, it, expect, vi, afterEach } from "vitest";
import {
  localeFromAcceptLanguage,
  normalizeLocale,
  readCookie,
  resolveClientLocale,
  resolveInitialLocale,
  resolveRequestLocale,
} from "@/lib/i18n/locale";
import { formatDateTime, formatRelativeDate } from "@/lib/format";

describe("locale resolution", () => {
  it("normalizes tags", () => {
    expect(normalizeLocale("tr-TR")).toBe("tr");
    expect(normalizeLocale("EN_us")).toBe("en");
    expect(normalizeLocale("de")).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
  });

  it("ranks Accept-Language by q-value", () => {
    expect(localeFromAcceptLanguage("de-DE,tr;q=0.8,en;q=0.5")).toBe("tr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("tr;q=0.2,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("fr,de")).toBeUndefined();
    expect(localeFromAcceptLanguage(null)).toBeUndefined();
  });

  it("server: cookie → Accept-Language → en", () => {
    expect(resolveInitialLocale({ cookie: "tr", acceptLanguage: "en-US" })).toBe("tr");
    expect(resolveInitialLocale({ cookie: undefined, acceptLanguage: "tr-TR,tr;q=0.9" })).toBe("tr");
    expect(resolveInitialLocale({ cookie: "xx", acceptLanguage: "fr" })).toBe("en");
    expect(resolveInitialLocale({})).toBe("en");
  });

  it("client: saved preference → cookie → server initial", () => {
    expect(resolveClientLocale({ stored: "en", cookie: "tr", initial: "tr" })).toBe("en");
    expect(resolveClientLocale({ stored: null, cookie: "tr", initial: "en" })).toBe("tr");
    expect(resolveClientLocale({ stored: "xx", cookie: null, initial: "tr" })).toBe("tr");
  });

  it("reads cookies", () => {
    expect(readCookie("a=1; nexus-locale=tr; b=2", "nexus-locale")).toBe("tr");
    expect(readCookie("a=1", "nexus-locale")).toBeUndefined();
  });

  it("API: body → x-nexus-locale header → cookie, never Accept-Language", () => {
    const req = (headers: Record<string, string>) => new Request("http://x/api", { headers });
    expect(resolveRequestLocale(req({ "x-nexus-locale": "tr", cookie: "nexus-locale=en" }), "en")).toBe("en");
    expect(resolveRequestLocale(req({ "x-nexus-locale": "tr", cookie: "nexus-locale=en" }))).toBe("tr");
    expect(resolveRequestLocale(req({ cookie: "nexus-locale=tr" }))).toBe("tr");
    expect(resolveRequestLocale(req({ "accept-language": "tr-TR" }))).toBeUndefined();
  });
});

describe("formatters", () => {
  afterEach(() => vi.useRealTimers());

  it("relative dates follow the given locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    const fiveMinutesAgo = new Date("2026-01-10T11:55:00Z");
    expect(formatRelativeDate(fiveMinutesAgo, "en")).toBe("5m ago");
    expect(formatRelativeDate(fiveMinutesAgo, "tr")).toBe("5 dakika önce");
    expect(formatRelativeDate(new Date("2026-01-10T11:59:59Z"), "en")).toBe("just now");
  });

  it("absolute dates use the locale's Intl format", () => {
    const date = new Date("2026-03-04T10:00:00Z");
    expect(formatDateTime(date, "en", { month: "long", timeZone: "UTC" })).toBe("March");
    expect(formatDateTime(date, "tr", { month: "long", timeZone: "UTC" })).toBe("Mart");
  });
});
