"use client";

import { useEffect } from "react";
import {
  applyAppearance,
  normalizeTheme,
  resetAppearance,
  storeAppearance,
  type ThemePreference,
} from "@/lib/appearance";

/**
 * Applies the signed-in user's saved theme/compact mode to <html> while the
 * dashboard is mounted, caches it for the no-flash boot script, follows OS
 * changes for "system", and restores the default when leaving the dashboard.
 */
export function AppearanceSync({ theme, compact }: { theme: ThemePreference | string; compact: boolean }) {
  const normalized = normalizeTheme(theme);

  useEffect(() => {
    const root = document.documentElement;
    const appearance = { theme: normalized, compact };
    applyAppearance(root, appearance);
    storeAppearance(appearance);

    let media: MediaQueryList | null = null;
    const onChange = () => applyAppearance(root, appearance);
    if (normalized === "system" && typeof window.matchMedia === "function") {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change", onChange);
    }
    return () => {
      media?.removeEventListener?.("change", onChange);
    };
  }, [normalized, compact]);

  // Restore the default only when the dashboard itself unmounts.
  useEffect(() => () => resetAppearance(document.documentElement), []);

  return null;
}
