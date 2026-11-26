/**
 * Locale resolution shared by the server (root layout, API routes) and the
 * client provider. No React, no "use client": safe to import anywhere.
 *
 * Order for the rendered UI language:
 *   saved preference (localStorage, client only) → cookie → Accept-Language
 *   (or navigator.language on the client) → English.
 */

export type AppLocale = "tr" | "en";

export const SUPPORTED_LOCALES: readonly AppLocale[] = ["tr", "en"];
export const FALLBACK_LOCALE: AppLocale = "en";
/** localStorage key and cookie name; the cookie lets the server render the same language. */
export const LOCALE_STORAGE_KEY = "nexus-locale";
export const LOCALE_COOKIE = "nexus-locale";
/** Optional request header clients send so the API knows the UI language. */
export const LOCALE_HEADER = "x-nexus-locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Accepts "tr", "tr-TR", "EN_us"... and returns a supported locale or undefined. */
export function normalizeLocale(value: unknown): AppLocale | undefined {
  if (typeof value !== "string") return undefined;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isAppLocale(base) ? base : undefined;
}

/**
 * Picks the best supported language from an Accept-Language header, honouring
 * q-values ("de-DE,tr;q=0.8,en;q=0.5" → "tr").
 */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of ranked) {
    const locale = normalizeLocale(entry.tag);
    if (locale) return locale;
  }
  return undefined;
}

/** Server-side initial locale: cookie → Accept-Language → English. */
export function resolveInitialLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): AppLocale {
  return normalizeLocale(input.cookie) ?? localeFromAcceptLanguage(input.acceptLanguage) ?? FALLBACK_LOCALE;
}

/**
 * Client-side locale: saved preference → cookie → the server's initial locale
 * (which already applied Accept-Language, the same list as navigator.languages).
 */
export function resolveClientLocale(input: {
  stored?: string | null;
  cookie?: string | null;
  initial: AppLocale;
}): AppLocale {
  return normalizeLocale(input.stored) ?? normalizeLocale(input.cookie) ?? input.initial;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * The UI locale of an API request, or undefined when the client did not say.
 * Explicit body field → `x-nexus-locale` header → `nexus-locale` cookie.
 * Accept-Language is deliberately ignored: AI answers then follow the
 * language of the user's own input instead of a browser default.
 */
export function resolveRequestLocale(request: Pick<Request, "headers">, explicit?: unknown): AppLocale | undefined {
  return (
    normalizeLocale(explicit) ??
    normalizeLocale(request.headers.get(LOCALE_HEADER)) ??
    normalizeLocale(readCookie(request.headers.get("cookie"), LOCALE_COOKIE))
  );
}

export function intlLocale(locale: AppLocale): string {
  return locale === "tr" ? "tr-TR" : "en-US";
}

/** `<html>` attribute the provider keeps set to the active UI locale. */
export const UI_LOCALE_ATTR = "data-ui-locale";

/**
 * Active UI locale outside React (stores, plain fetch helpers). Undefined on
 * the server or before the provider mounted.
 */
export function currentUiLocale(): AppLocale | undefined {
  if (typeof document === "undefined") return undefined;
  return normalizeLocale(document.documentElement.getAttribute(UI_LOCALE_ATTR));
}

/** Header carrying the UI locale to API routes (empty when unknown). */
export function localeHeaders(locale: AppLocale | undefined = currentUiLocale()): Record<string, string> {
  return locale ? { [LOCALE_HEADER]: locale } : {};
}
