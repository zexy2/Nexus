export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const taskStatusSet = new Set<string>(TASK_STATUSES);
const taskPrioritySet = new Set<string>(TASK_PRIORITIES);

export function parseTaskStatus(value: unknown, fallback?: TaskStatus): TaskStatus | null {
  if (value === undefined || value === null) {
    return fallback ?? null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return fallback ?? null;
  }

  return taskStatusSet.has(normalized) ? (normalized as TaskStatus) : null;
}

export function parseTaskPriority(value: unknown, fallback?: TaskPriority): TaskPriority | null {
  if (value === undefined || value === null) {
    return fallback ?? null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback ?? null;
  }

  return taskPrioritySet.has(normalized) ? (normalized as TaskPriority) : null;
}

export function parseTaskTitle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();
  if (!title || title.length > 500) {
    return null;
  }

  return title;
}

export function parseOptionalTaskDescription(value: unknown, fallback: string | null = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return typeof value === "string" ? value : null;
}

export function parseOptionalDueDate(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return "invalid";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}
