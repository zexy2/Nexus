"use client";

/**
 * Lightweight client-side i18n. The dashboard is entirely client-rendered, so a
 * context + localStorage-backed locale is enough — no route segments, no server
 * plumbing. `useT()` returns a typed `t("namespace.key")` lookup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { messages, type AppLocale, LOCALES } from "./messages";

const STORAGE_KEY = "nexus-locale";
const DEFAULT_LOCALE: AppLocale = "tr";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (path: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolve(locale: AppLocale, path: string): string {
  const segments = path.split(".");
  // Look up in the active locale, falling back to Turkish, then the raw key.
  for (const root of [messages[locale], messages[DEFAULT_LOCALE]]) {
    let cursor: unknown = root;
    let ok = true;
    for (const seg of segments) {
      if (cursor && typeof cursor === "object" && seg in cursor) {
        cursor = (cursor as Record<string, unknown>)[seg];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && typeof cursor === "string") return cursor;
  }
  return path;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as string[]).includes(stored)) {
      // Intentional: hydrate the persisted locale only after mount so the first
      // client render matches the server (default locale), avoiding a hydration
      // mismatch. This one synchronous setState is the documented pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(stored as AppLocale);
    }
  }, []);

  // Keep <html lang> in sync for accessibility/SEO.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback((path: string) => resolve(locale, path), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe fallback so a component used outside the provider still renders.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (path: string) => resolve(DEFAULT_LOCALE, path),
    };
  }
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT() {
  return useLocale().t;
}
