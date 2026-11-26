/**
 * Client helpers for the ⌘K workspace search: query normalisation, offline
 * search over the local sync store rows, highlight splitting and the
 * "recent items" list. Pure (except the localStorage helpers) so it is unit
 * testable. Online search goes to GET /api/search, which is keyword-only and
 * consumes no AI budget (the semantic variant is POST-only and never used here).
 */

export type PaletteHitType = "document" | "task";

export interface PaletteHit {
  id: string;
  type: PaletteHitType;
  title: string;
  snippet: string;
  href: string;
}

export const MIN_QUERY_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 200;
const RECENT_KEY = "nexus-palette-recent";
const RECENT_MAX = 6;

export function hitHref(type: PaletteHitType, id: string): string {
  return type === "document" ? `/dashboard/docs/${id}` : `/dashboard/tasks/${id}`;
}

export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

export function extractPlainText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === "object" && "content" in block && Array.isArray(block.content)) {
          return block.content.map((item: { text?: string }) => item?.text || "").join(" ");
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

export function makeSnippet(text: string, query: string, max = 110): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  const word = normalizeQuery(query).toLowerCase().split(" ")[0] ?? "";
  const idx = word ? flat.toLowerCase().indexOf(word) : -1;
  if (idx === -1) return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  const start = Math.max(0, idx - 30);
  const end = Math.min(flat.length, start + max);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Split text into parts, flagging the ones that match any query word. */
export function splitHighlight(text: string, query: string): { text: string; match: boolean }[] {
  const words = Array.from(
    new Set(normalizeQuery(query).toLowerCase().split(" ").filter((w) => w.length > 0))
  );
  if (!text || words.length === 0) return [{ text, match: false }];
  const escaped = [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: words.includes(part.toLowerCase()) }));
}

interface LocalDoc { id: string; title: string; content?: unknown; isArchived?: boolean | number; updatedAt?: number }
interface LocalTask { id: string; title: string; description?: string; isArchived?: boolean | number; updatedAt?: number }

function score(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const words = q.split(" ").filter((w) => w.length > 0);
  if (!words.length) return 0;
  if (!words.every((w) => t.includes(w))) return 0;
  return words.length + (t.includes(q) ? 2 : 0);
}

/** Offline keyword search over rows from the local sync store. */
export function searchLocalRows(
  query: string,
  docs: LocalDoc[],
  tasks: LocalTask[],
  limit = 8
): PaletteHit[] {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const scored: { hit: PaletteHit; s: number; u: number }[] = [];
  for (const d of docs) {
    if (d.isArchived) continue;
    const body = extractPlainText(d.content);
    // A title match outranks a body-only match.
    const s = score(q, d.title) * 2 + score(q, body);
    if (s > 0) {
      scored.push({
        hit: { id: d.id, type: "document", title: d.title, snippet: makeSnippet(body, q), href: hitHref("document", d.id) },
        s,
        u: d.updatedAt ?? 0,
      });
    }
  }
  for (const t of tasks) {
    if (t.isArchived) continue;
    const s = score(q, t.title) * 2 + score(q, t.description || "");
    if (s > 0) {
      scored.push({
        hit: { id: t.id, type: "task", title: t.title, snippet: makeSnippet(t.description || "", q), href: hitHref("task", t.id) },
        s,
        u: t.updatedAt ?? 0,
      });
    }
  }
  return scored.sort((a, b) => b.s - a.s || b.u - a.u).slice(0, limit).map((x) => x.hit);
}

/** Map GET /api/search results to palette hits. */
export function hitsFromApi(
  results: { id: string; type: PaletteHitType; title: string; highlight?: string }[]
): PaletteHit[] {
  return results.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    snippet: r.highlight && r.highlight !== r.title ? r.highlight : "",
    href: hitHref(r.type, r.id),
  }));
}

export function loadRecent(): PaletteHit[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as PaletteHit[]) : [];
    return Array.isArray(parsed) ? parsed.filter((h) => h && h.id && h.href && h.title).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecent(hit: PaletteHit): void {
  try {
    const next = [{ ...hit, snippet: "" }, ...loadRecent().filter((h) => !(h.id === hit.id && h.type === hit.type))].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: recents are a convenience only
  }
}
