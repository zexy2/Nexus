/**
 * Kanban drop resolution helpers.
 *
 * dnd-kit resolves `over` for onDragEnd from the state committed by the last
 * React render. Pointer moves are rendered asynchronously (continuous event
 * priority), so when the pointer is released right after the final move — a
 * fast flick, a busy main thread, or automated input — `over` can still point
 * at a column the pointer already left, and the card lands one column short.
 * Resolving the column from the actual release coordinates removes that race.
 */

export const KANBAN_COLUMN_ATTRIBUTE = "data-kanban-column";

export interface PointerPosition {
  x: number;
  y: number;
}

type PointQueryable = {
  elementsFromPoint?: (x: number, y: number) => Element[];
};

/**
 * Returns the id of the Kanban column under the given viewport point, or null
 * when the point is not over a column (or the platform cannot hit-test).
 */
export function findKanbanColumnAtPoint<T extends string>(
  doc: PointQueryable,
  point: PointerPosition | null,
  allowedIds: readonly T[]
): T | null {
  if (!point || typeof doc.elementsFromPoint !== "function") return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

  for (const element of doc.elementsFromPoint(point.x, point.y)) {
    const column = element.closest?.(`[${KANBAN_COLUMN_ATTRIBUTE}]`);
    const id = column?.getAttribute(KANBAN_COLUMN_ATTRIBUTE);
    if (id && (allowedIds as readonly string[]).includes(id)) return id as T;
  }

  return null;
}

/** True when the drag was started by a pointer (mouse/touch/pen), not the keyboard. */
export function isPointerActivated(activatorEvent: Event | null | undefined): boolean {
  if (!activatorEvent) return false;
  return typeof (activatorEvent as Partial<PointerEvent>).clientX === "number";
}
