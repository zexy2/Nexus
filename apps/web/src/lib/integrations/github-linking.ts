const CLOSING_ISSUE_REFERENCE =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)(?:\s*[:,-]?\s*|\/\s*)#(\d+)\b/gi;
const ISSUE_REFERENCE = /(^|[^\w])#(\d+)\b/g;
const REQUIREMENT_REFERENCE = /\bREQ-\d+\b/gi;

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

  collectMatches(ordered, input.title, CLOSING_ISSUE_REFERENCE, (match) => `#${match[1]}`);
  collectMatches(ordered, input.body, CLOSING_ISSUE_REFERENCE, (match) => `#${match[1]}`);
  collectMatches(ordered, input.title, ISSUE_REFERENCE, (match) => `#${match[2]}`);
  collectMatches(ordered, input.body, ISSUE_REFERENCE, (match) => `#${match[2]}`);
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
