"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme actually applied to <html> ("light" | "dark"), kept in sync with
 * applyAppearance() via a class observer. For third-party widgets (BlockNote)
 * that need an explicit theme prop instead of reading CSS variables.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function getServerSnapshot(): "light" | "dark" {
  return "dark";
}

export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
