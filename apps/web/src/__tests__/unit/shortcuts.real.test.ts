import { describe, it, expect } from "vitest";
import {
  createNavSequenceMatcher,
  isCommandPaletteShortcut,
  isEditableTarget,
  isNewChatShortcut,
  navShortcutLabel,
} from "@/lib/shortcuts";

const key = (k: string, over: Partial<KeyboardEventInit & { target: EventTarget | null; code: string }> = {}) => ({
  key: k,
  code: over.code,
  metaKey: over.metaKey ?? false,
  ctrlKey: over.ctrlKey ?? false,
  altKey: over.altKey ?? false,
  shiftKey: over.shiftKey ?? false,
  target: over.target ?? document.body,
});

describe("global shortcuts", () => {
  it("⌘K / Ctrl+K opens the palette; ⌘1-9 is left to the browser", () => {
    expect(isCommandPaletteShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isCommandPaletteShortcut(key("k", { ctrlKey: true }))).toBe(true);
    expect(isCommandPaletteShortcut(key("K", { metaKey: true, shiftKey: true }))).toBe(false);
    const match = createNavSequenceMatcher();
    expect(match(key("1", { metaKey: true }))).toBeNull();
  });

  it("G then P/W/C/R navigates, within the timeout", () => {
    let now = 0;
    const match = createNavSequenceMatcher(() => now);
    expect(match(key("g"))).toBeNull();
    expect(match(key("w"))).toBe("/dashboard/tasks");
    expect(match(key("g"))).toBeNull();
    now = 5000;
    expect(match(key("p"))).toBeNull(); // too late
    expect(navShortcutLabel("/dashboard/docs")).toBe("G P");
  });

  it("ignores sequences typed into editable fields", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editor.appendChild(inner);
    document.body.append(input, editor);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(inner)).toBe(true);
    const match = createNavSequenceMatcher();
    expect(match(key("g", { target: input }))).toBeNull();
    expect(match(key("p", { target: input }))).toBeNull();
    input.remove();
    editor.remove();
  });

  it("new chat is Alt+Shift+N, not ⌘K", () => {
    expect(isNewChatShortcut(key("Ñ", { altKey: true, shiftKey: true, code: "KeyN" }))).toBe(true);
    expect(isNewChatShortcut(key("k", { metaKey: true, code: "KeyK" }))).toBe(false);
  });
});
