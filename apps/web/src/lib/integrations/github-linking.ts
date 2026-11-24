// Separator is either one punctuation mark with optional surrounding whitespace
// or plain whitespace. Kept unambiguous (no adjacent `\s*` groups) so long
// whitespace runs stay linear instead of quadratic backtracking.
const CLOSING_ISSUE_REFERENCE =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)(?:\s*[:,\/-]\s*|\s+)#(\d+)\b/gi;
// Fenced blocks (```...``` / ~~~...~~~, an unterminated fence runs to the end)
// and inline code spans are not prose, so their `#123` is never an issue mention.
// Both alternations are bounded by literal delimiters and use lazy matching
// over a single char class, so they stay linear.
const FENCED_CODE = /(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;
// A 6 or 3 digit-only `#123456` directly after a CSS-ish key (`color:`, `background: `).
const CSS_COLOR_CONTEXT = /(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*$/i;
const ISSUE_REFERENCE = /(^|[^\w])#(\d+)\b/g;
const REQUIREMENT_REFERENCE = /\bREQ-\d+\b/gi;

function stripCode(text: string) {
  return text.replace(FENCED_CODE, " ").replace(INLINE_CODE, " ");
}

function isCssColor(text: string, match: RegExpMatchArray) {
  const digits = match[2];
  if (digits.length !== 3 && digits.length !== 6) return false;
  const start = (match.index ?? 0) + match[1].length;
  // Bounded look-behind window keeps the check O(1) per match.
  return CSS_COLOR_CONTEXT.test(text.slice(Math.max(0, start - 40), start));
}

function collectIssueMatches(target: Set<string>, text: string | null | undefined) {
  if (!text) return;
  const prose = stripCode(text);
  ISSUE_REFERENCE.lastIndex = 0;
  for (const match of prose.matchAll(ISSUE_REFERENCE)) {
    if (!isCssColor(prose, match)) target.add(`#${match[2]}`);
  }
}

function collectMatches(
  target: Set<string>,
  text: string | null | undefined,
  pattern: RegExp,
  format: (match: RegExpMatchArray) => string
) {
  if (!text) return;
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) target.add(format(match));
}

export function extractPullRequestReferences(input: {
  title: string;
  body?: string | null;
  branch?: string | null;
}) {
  const ordered = new Set<string>();

  collectMatches(ordered, input.title && stripCode(input.title), CLOSING_ISSUE_REFERENCE, (match) => `#${match[1]}`);
  collectMatches(ordered, input.body && stripCode(input.body), CLOSING_ISSUE_REFERENCE, (match) => `#${match[1]}`);
  collectIssueMatches(ordered, input.title);
  collectIssueMatches(ordered, input.body);
  collectMatches(ordered, input.title, REQUIREMENT_REFERENCE, (match) => match[0].toUpperCase());
  collectMatches(ordered, input.body, REQUIREMENT_REFERENCE, (match) => match[0].toUpperCase());
  collectMatches(ordered, input.branch, REQUIREMENT_REFERENCE, (match) => match[0].toUpperCase());

  return Array.from(ordered);
}

export function buildGitHubIssueReferenceMap(
  issues: Array<{ id: string; externalKey: string | null; title: string; description: string | null }>
) {
  const referenceToIssueId = new Map<string, string>();

  for (const issue of issues) {
    if (issue.externalKey) referenceToIssueId.set(issue.externalKey.toUpperCase(), issue.id);
    for (const text of [issue.title, issue.description]) {
      if (!text) continue;
      for (const match of text.matchAll(REQUIREMENT_REFERENCE)) {
        referenceToIssueId.set(match[0].toUpperCase(), issue.id);
      }
    }
  }

  return referenceToIssueId;
}
