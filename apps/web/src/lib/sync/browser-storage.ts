/**
 * Robust browser-storage accessor. Node >= 25 ships a built-in global
 * `localStorage` (warning-y / throwing without --localstorage-file), so
 * `typeof localStorage` is not a reliable "in a browser" check. Go through
 * `window` and guard against access errors (privacy modes, blocked storage).
 */
export function getBrowserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
