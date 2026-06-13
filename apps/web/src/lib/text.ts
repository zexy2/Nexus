/**
 * Small text helpers for cleaning up values that originate from AI/markdown
 * before they are shown in the UI.
 */

/**
 * Turn a possibly-markdown string into a clean, human title.
 *
 * AI-generated docs sometimes store the first markdown heading verbatim, so a
 * card title can read "## 8. Üreme Sistemi" with the literal "##" showing.
 * This strips leading heading hashes, surrounding markdown emphasis, and
 * collapses whitespace so the title reads like a title.
 */
export function cleanDocTitle(raw: string | null | undefined, fallback = "Adsız"): string {
  if (!raw) return fallback;
  let title = raw.trim();
  // Drop a leading markdown heading marker ("#", "##", ... possibly numbered).
  title = title.replace(/^#{1,6}\s+/, "");
  // Strip wrapping bold/italic markers.
  title = title.replace(/^\*{1,3}(.+?)\*{1,3}$/, "$1");
  title = title.replace(/^_{1,3}(.+?)_{1,3}$/, "$1");
  // Collapse internal whitespace/newlines.
  title = title.replace(/\s+/g, " ").trim();
  return title || fallback;
}

/**
 * Derive a clean, single-line title from a block of (possibly markdown)
 * content — the first non-empty line, heading markers removed, truncated.
 */
export function deriveTitleFromContent(content: string, maxLength = 80): string {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "";
  const cleaned = cleanDocTitle(firstLine, "");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}
