import { describe, expect, it } from "vitest";
import {
  KANBAN_COLUMN_ATTRIBUTE,
  findKanbanColumnAtPoint,
  isPointerActivated,
} from "@/lib/kanban-drop";

const COLUMNS = ["todo", "in_progress", "in_review", "done"] as const;

function column(id: string) {
  const el = document.createElement("div");
  el.setAttribute(KANBAN_COLUMN_ATTRIBUTE, id);
  const card = document.createElement("div");
  el.appendChild(card);
  return { el, card };
}

describe("findKanbanColumnAtPoint", () => {
  it("resolves the column that contains the topmost hit element", () => {
    const review = column("in_review");
    const overlay = document.createElement("div");
    const doc = { elementsFromPoint: () => [overlay, review.card, review.el, document.body] };

    expect(findKanbanColumnAtPoint(doc, { x: 10, y: 10 }, COLUMNS)).toBe("in_review");
  });

  it("ignores unknown column ids and points outside any column", () => {
    const unknown = column("archived");
    expect(
      findKanbanColumnAtPoint({ elementsFromPoint: () => [unknown.card] }, { x: 1, y: 1 }, COLUMNS)
    ).toBeNull();
    expect(
      findKanbanColumnAtPoint({ elementsFromPoint: () => [document.body] }, { x: 1, y: 1 }, COLUMNS)
    ).toBeNull();
  });

  it("returns null without a point or hit-testing support", () => {
    const done = column("done");
    expect(findKanbanColumnAtPoint({ elementsFromPoint: () => [done.el] }, null, COLUMNS)).toBeNull();
    expect(findKanbanColumnAtPoint({}, { x: 1, y: 1 }, COLUMNS)).toBeNull();
    expect(
      findKanbanColumnAtPoint({ elementsFromPoint: () => [done.el] }, { x: Number.NaN, y: 1 }, COLUMNS)
    ).toBeNull();
  });
});

describe("isPointerActivated", () => {
  it("distinguishes pointer drags from keyboard drags", () => {
    expect(isPointerActivated(new MouseEvent("pointerdown", { clientX: 5, clientY: 5 }))).toBe(true);
    expect(isPointerActivated(new KeyboardEvent("keydown", { key: " " }))).toBe(false);
    expect(isPointerActivated(null)).toBe(false);
  });
});
