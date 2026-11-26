/**
 * Count-aware lookup: `plural(t, "feedback.plansShown", n)` reads
 * `feedback.plansShownOne` when n === 1 and `feedback.plansShownOther`
 * otherwise, replacing `{n}` with the count. Turkish nouns do not inflect
 * after numbers, so both TR variants may be identical; English needs both.
 */
export function plural(t: (path: string) => string, base: string, count: number): string {
  const key = count === 1 ? `${base}One` : `${base}Other`;
  return t(key).replaceAll("{n}", String(count));
}
