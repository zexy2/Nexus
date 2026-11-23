/**
 * Theme + compact settings are actually applied to <html>, cached for the
 * no-flash boot script, and reset when leaving the dashboard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppearanceSync } from "@/components/shared/appearance-sync";
import {
  APPEARANCE_BOOT_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  readStoredAppearance,
  resolveTheme,
} from "@/lib/appearance";

const root = document.documentElement;

function mockPrefersDark(dark: boolean) {
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
  return listeners;
}

beforeEach(() => {
  window.localStorage.clear();
  root.className = "dark";
  root.style.colorScheme = "";
  mockPrefersDark(true);
});

describe("resolveTheme", () => {
  it("maps system to the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("AppearanceSync", () => {
  it("applies light theme + compact mode and caches it", () => {
    render(<AppearanceSync theme="light" compact />);
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("compact")).toBe(true);
    expect(readStoredAppearance()).toEqual({ theme: "light", compact: true });
  });

  it("follows the OS for 'system'", () => {
    mockPrefersDark(false);
    render(<AppearanceSync theme="system" compact={false} />);
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("compact")).toBe(false);
  });

  it("falls back to dark for unknown values and resets on unmount", () => {
    const { unmount, rerender } = render(<AppearanceSync theme="light" compact />);
    rerender(<AppearanceSync theme="neon" compact={false} />);
    expect(root.classList.contains("dark")).toBe(true);
    rerender(<AppearanceSync theme="light" compact />);
    unmount();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);
    expect(root.classList.contains("compact")).toBe(false);
  });
});

describe("APPEARANCE_BOOT_SCRIPT", () => {
  function runBootScript(pathname: string) {
    window.history.replaceState(null, "", pathname);
    new Function(APPEARANCE_BOOT_SCRIPT)();
  }

  it("applies the cached choice before paint on dashboard routes", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: "light", compact: true }));
    runBootScript("/dashboard/docs");
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("compact")).toBe(true);
  });

  it("leaves marketing pages dark", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: "light", compact: true }));
    runBootScript("/");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("compact")).toBe(false);
  });

  it("does nothing without a cache or with corrupt data", () => {
    runBootScript("/dashboard");
    expect(root.className).toBe("dark");
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "{not json");
    runBootScript("/dashboard");
    expect(root.className).toBe("dark");
  });
});
