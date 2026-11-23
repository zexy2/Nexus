/**
 * Theme + compact-mode application.
 *
 * The server (user_settings.theme / compact_mode) is the source of truth. The
 * last known value is cached in localStorage so the inline boot script in the
 * root layout can set the <html> classes before first paint (no flash), and
 * <AppearanceSync> reconciles with the server value once the dashboard mounts.
 *
 * Only dashboard routes follow the user's choice; the marketing/auth pages
 * were designed dark-only and stay dark.
 */
export type ThemePreference = "light" | "dark" | "system";

interface Appearance {
  theme: ThemePreference;
  compact: boolean;
}

export const APPEARANCE_STORAGE_KEY = "nexus-appearance";
const DEFAULT_APPEARANCE: Appearance = { theme: "dark", compact: false };
const COMPACT_CLASS = "compact";

/**
 * Maps a stored value to a known preference. "system" is kept as-is and
 * resolved against prefers-color-scheme by resolveTheme(); anything unknown
 * falls back to dark, the app-wide default.
 */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "system" ? value : "dark";
}

export function resolveTheme(theme: ThemePreference, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

function prefersDarkScheme(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyAppearance(
  root: HTMLElement,
  appearance: Appearance,
  prefersDark: boolean = prefersDarkScheme()
): void {
  const resolved = resolveTheme(appearance.theme, prefersDark);
  root.classList.remove(resolved === "dark" ? "light" : "dark");
  root.classList.add(resolved);
  root.classList.toggle(COMPACT_CLASS, appearance.compact);
  root.style.colorScheme = resolved;
}

/** Back to the app-wide default (dark, regular density) outside the dashboard. */
export function resetAppearance(root: HTMLElement): void {
  applyAppearance(root, DEFAULT_APPEARANCE, true);
}

export function readStoredAppearance(): Appearance | null {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return { theme: normalizeTheme(parsed.theme), compact: parsed.compact === true };
  } catch {
    return null;
  }
}

export function storeAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage unavailable: the server value is still applied on mount.
  }
}

/**
 * Runs inline in <head> before paint. Must stay self-contained (no imports)
 * and mirror applyAppearance above.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{
if(location.pathname.indexOf('/dashboard')!==0)return;
var raw=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});if(!raw)return;
var a=JSON.parse(raw)||{};var t=a.theme==='light'?'light':'dark';
if(a.theme==='system'&&window.matchMedia)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
var r=document.documentElement;r.classList.remove(t==='dark'?'light':'dark');r.classList.add(t);
r.style.colorScheme=t;if(a.compact===true)r.classList.add(${JSON.stringify(COMPACT_CLASS)});
}catch(e){}})();`;
