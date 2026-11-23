/**
 * Global keyboard shortcuts (single source of truth).
 *
 *   ⌘K / Ctrl+K        Toggle the command palette (everywhere, also in inputs).
 *   G then P           Go to Plans   (/dashboard/docs)
 *   G then W           Go to Work    (/dashboard/tasks)
 *   G then C           Go to Changes (/dashboard/changes)
 *   G then R           Go to Runs    (/dashboard/agents)
 *   ⌥⇧N / Alt+Shift+N  New chat (chat page only)
 *   ⌘B / Ctrl+B        Toggle sidebar, except while typing (editor bold wins)
 *
 * Deliberately NOT used: ⌘1-9 / Ctrl+1-9 (browser tab switching), Alt+1-9
 * (tab switching on Linux), ⌘N/⌘T/⌘W/⌘J (browser-reserved or downloads).
 * The two-key "G" sequences have no modifier at all, so they never collide
 * with the browser; they are ignored while focus is in an editable field.
 */

const NAV_SEQUENCE_PREFIX = "g";
const NAV_SEQUENCE_TIMEOUT_MS = 1500;

const NAV_SHORTCUTS: Record<string, string> = {
  p: "/dashboard/docs",
  w: "/dashboard/tasks",
  c: "/dashboard/changes",
  r: "/dashboard/agents",
};

/** Label for a nav target, e.g. "G P". */
export function navShortcutLabel(href: string): string | undefined {
  const key = Object.keys(NAV_SHORTCUTS).find((k) => NAV_SHORTCUTS[k] === href);
  return key ? `G ${key.toUpperCase()}` : undefined;
}

type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & {
  code?: string;
  target?: EventTarget | null;
};

export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return Boolean(el.closest?.('[contenteditable="true"], [contenteditable=""]'));
}

export function isCommandPaletteShortcut(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
}

export function isNewChatShortcut(e: KeyLike): boolean {
  return e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === "KeyN";
}

function isPlainKey(e: KeyLike): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * Stateful matcher for "G then <key>" navigation. Feed it every keydown;
 * it returns the target href when a sequence completes.
 */
export function createNavSequenceMatcher(now: () => number = () => Date.now()) {
  let armedAt: number | null = null;
  return (e: KeyLike): string | null => {
    if (!isPlainKey(e) || isEditableTarget(e.target)) {
      armedAt = null;
      return null;
    }
    const key = e.key.toLowerCase();
    if (armedAt !== null && now() - armedAt <= NAV_SEQUENCE_TIMEOUT_MS) {
      armedAt = null;
      return NAV_SHORTCUTS[key] ?? null;
    }
    armedAt = key === NAV_SEQUENCE_PREFIX && !e.shiftKey ? now() : null;
    return null;
  };
}
