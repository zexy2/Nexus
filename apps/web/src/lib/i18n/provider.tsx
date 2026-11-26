"use client";

/**
 * Lightweight client-side i18n. A context + localStorage-backed locale is
 * enough — no route segments. The root layout resolves an initial locale on
 * the server (cookie → Accept-Language → English) so the first render and
 * `<html lang>` already match; after mount a saved preference wins.
 * `useT()` returns a typed `t("namespace.key")` lookup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { messages, type AppLocale } from "./messages";
import {
  FALLBACK_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  readCookie,
  resolveClientLocale,
  UI_LOCALE_ATTR,
} from "./locale";

/** Root `<html>` attribute a page sets when its content is in a fixed language (see ForceDocumentLang). */
const FORCED_LANG_ATTR = "data-forced-lang";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (path: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function lookup(root: unknown, segments: string[]): string | undefined {
  let cursor: unknown = root;
  for (const seg of segments) {
    if (cursor && typeof cursor === "object" && seg in cursor) {
      cursor = (cursor as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cursor === "string" ? cursor : undefined;
}

export function translate(locale: AppLocale, path: string): string {
  const segments = path.split(".");
  // Active locale, then English, then the raw key.
  return lookup(messages[locale], segments) ?? lookup(messages[FALLBACK_LOCALE], segments) ?? path;
}

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / blocked storage: the cookie below still carries it.
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function applyDocumentLang(locale: AppLocale) {
  const root = document.documentElement;
  root.setAttribute(UI_LOCALE_ATTR, locale);
  root.lang = root.getAttribute(FORCED_LANG_ATTR) || locale;
}

export function LocaleProvider({
  children,
  initialLocale = FALLBACK_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  // Hydrate the saved preference after mount (the first client render matches
  // the server's initial locale, avoiding a hydration mismatch).
  useEffect(() => {
    const stored = readStorage();
    const resolved = resolveClientLocale({
      stored,
      cookie: readCookie(document.cookie, LOCALE_COOKIE),
      initial: initialLocale,
    });
    // A saved preference is mirrored into the cookie so the next server
    // render (and API calls) use the same language.
    if (stored && resolved === stored && readCookie(document.cookie, LOCALE_COOKIE) !== stored) {
      persistLocale(resolved);
    }
    if (resolved !== initialLocale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(resolved);
    }
  }, [initialLocale]);

  // Keep <html lang> in sync for accessibility, SEO and CSS text-transform
  // (Turkish casing turns "public" into "PUBLİC").
  useEffect(() => {
    applyDocumentLang(locale);
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback((path: string) => translate(locale, path), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * For pages whose copy exists in one language only (landing, legal pages):
 * pins `<html lang>` to that language while mounted, whatever the UI locale.
 */
export function ForceDocumentLang({ lang }: { lang: AppLocale }) {
  const { locale } = useLocale();
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(FORCED_LANG_ATTR, lang);
    root.lang = lang;
    return () => {
      root.removeAttribute(FORCED_LANG_ATTR);
      root.lang = locale;
    };
  }, [lang, locale]);
  return null;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe fallback so a component used outside the provider still renders.
    return {
      locale: FALLBACK_LOCALE,
      setLocale: () => {},
      t: (path: string) => translate(FALLBACK_LOCALE, path),
    };
  }
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT() {
  return useLocale().t;
}
