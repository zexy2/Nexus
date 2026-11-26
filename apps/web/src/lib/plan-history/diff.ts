/**
 * Pure diff helpers for Living Plan version history. Shared by the diff API
 * route (server) and the diff view (client), so no server-only imports here.
 */

export type DiffLine =
  | { type: "equal"; text: string; oldNumber: number; newNumber: number }
  | { type: "removed"; text: string; oldNumber: number }
  | { type: "added"; text: string; newNumber: number };

export type DiffHunkItem =
  | DiffLine
  | { type: "collapsed"; count: number; oldStart: number; newStart: number; startIndex: number };

// Above this many LCS cells the diff falls back to "replace everything" so a
// pathological document cannot pin the server CPU or allocate gigabytes.
const MAX_LCS_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Line-level diff (LCS) between two plain-text plan bodies. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < prefix; i++) {
    result.push({ type: "equal", text: a[i]!, oldNumber: i + 1, newNumber: i + 1 });
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const n = midA.length;
  const m = midB.length;

  if (n * m > MAX_LCS_CELLS) {
    midA.forEach((text, i) => result.push({ type: "removed", text, oldNumber: prefix + i + 1 }));
    midB.forEach((text, j) => result.push({ type: "added", text, newNumber: prefix + j + 1 }));
  } else if (n > 0 || m > 0) {
    // lengths[i][j] = LCS length of midA[i..] and midB[j..], flattened.
    const width = m + 1;
    const lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i * width + j] =
          midA[i] === midB[j]
            ? lengths[(i + 1) * width + j + 1]! + 1
            : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        result.push({
          type: "equal",
          text: midA[i]!,
          oldNumber: prefix + i + 1,
          newNumber: prefix + j + 1,
        });
        i++;
        j++;
      } else if (i < n && (j >= m || lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)) {
        // Prefer removals first so a replaced line reads "- old / + new".
        result.push({ type: "removed", text: midA[i]!, oldNumber: prefix + i + 1 });
        i++;
      } else {
        result.push({ type: "added", text: midB[j]!, newNumber: prefix + j + 1 });
        j++;
      }
    }
  }

  for (let k = 0; k < suffix; k++) {
    const oldIndex = a.length - suffix + k;
    const newIndex = b.length - suffix + k;
    result.push({ type: "equal", text: a[oldIndex]!, oldNumber: oldIndex + 1, newNumber: newIndex + 1 });
  }
  return result;
}

/** Collapse long unchanged runs, keeping `context` lines around each change. */
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffHunkItem[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type === "equal") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) {
      keep[k] = true;
    }
  });

  const result: DiffHunkItem[] = [];
  let index = 0;
  while (index < lines.length) {
    if (keep[index]) {
      result.push(lines[index]!);
      index++;
      continue;
    }
    const start = index;
    while (index < lines.length && !keep[index]) index++;
    const first = lines[start] as Extract<DiffLine, { type: "equal" }>;
    const count = index - start;
    // Hiding a single line saves nothing; show it.
    if (count === 1) {
      result.push(first);
    } else {
      result.push({
        type: "collapsed",
        count,
        oldStart: first.oldNumber,
        newStart: first.newNumber,
        startIndex: start,
      });
    }
  }
  return result;
}

export type DiffRequirement = {
  stableKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: string;
};

export type RequirementChangeField = "title" | "description" | "acceptanceCriteria";

export type RequirementDiff = {
  added: Array<{ stableKey: string; title: string }>;
  removed: Array<{ stableKey: string; title: string }>;
  modified: Array<{
    stableKey: string;
    fromTitle: string;
    toTitle: string;
    fields: RequirementChangeField[];
  }>;
  unchanged: number;
};

/** Requirement-level diff keyed by stable requirement key (REQ-001 ...). */
export function diffRequirements(
  before: DiffRequirement[],
  after: DiffRequirement[]
): RequirementDiff {
  const active = (items: DiffRequirement[]) =>
    new Map(items.filter((item) => item.status !== "removed").map((item) => [item.stableKey, item]));
  const from = active(before);
  const to = active(after);
  const result: RequirementDiff = { added: [], removed: [], modified: [], unchanged: 0 };

  for (const [key, next] of to) {
    const previous = from.get(key);
    if (!previous) {
      result.added.push({ stableKey: key, title: next.title });
      continue;
    }
    const fields: RequirementChangeField[] = [];
    if (previous.title !== next.title) fields.push("title");
    if (previous.description !== next.description) fields.push("description");
    if (JSON.stringify(previous.acceptanceCriteria) !== JSON.stringify(next.acceptanceCriteria)) {
      fields.push("acceptanceCriteria");
    }
    if (fields.length === 0) {
      result.unchanged++;
    } else {
      result.modified.push({ stableKey: key, fromTitle: previous.title, toTitle: next.title, fields });
    }
  }
  for (const [key, previous] of from) {
    if (!to.has(key)) result.removed.push({ stableKey: key, title: previous.title });
  }

  const byKey = (x: { stableKey: string }, y: { stableKey: string }) => x.stableKey.localeCompare(y.stableKey);
  result.added.sort(byKey);
  result.removed.sort(byKey);
  result.modified.sort(byKey);
  return result;
}

export function diffLineStats(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added++;
    else if (line.type === "removed") removed++;
  }
  return { added, removed };
}
