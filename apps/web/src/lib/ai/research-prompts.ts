/**
 * Prompts for /api/research/deep. Kept out of the route file (Next only allows
 * HTTP handlers and config as route exports) so they can be unit tested.
 */
import type { AppLocale } from "@/lib/i18n/locale";
import { languageName, responseLanguageInstruction } from "@/lib/ai/response-language";

/** Search queries follow the UI language when known, else the topic's language. */
export function buildPlanPrompt(query: string, locale: AppLocale | undefined): string {
  const queryLanguage = locale ? `in ${languageName(locale)}` : "in the same language as the topic";
  return `You are a research planning assistant. Break down this research topic into 4-6 specific search queries that will help gather comprehensive information.

Topic: "${query}"

Return ONLY a JSON array of search queries ${queryLanguage}. Example: ["query 1", "query 2", "query 3"]`;
}

export function buildReportPrompt(input: {
  query: string;
  answerSummaries: string;
  sourceSummaries: string;
  locale: AppLocale | undefined;
}): string {
  return `You are a research analyst. Write a short, focused report from the web research results below.

**RESEARCH TOPIC:** "${input.query}"

**TAVILY RESEARCH ANSWERS:**
${input.answerSummaries}

**SOURCE SUMMARIES:**
${input.sourceSummaries}

**INSTRUCTIONS:**
- ${input.locale ? responseLanguageInstruction(input.locale) : "Write in the same language as the research topic."} Translate the section headings below into that language.
- Be SHORT and SPECIFIC - at most 400 words
- Give information directly, no filler introduction
- Use Markdown (## headings, - bullets)
- Cite source numbers as [1], [2]
- Do NOT use phrases like "This report..." or "Our research..."
- State the findings directly

**FORMAT:**
## 🎯 Summary
(2-3 sentences of key findings)

## 📊 Key Findings
- Finding 1 [source]
- Finding 2 [source]
- Finding 3 [source]

## 💡 Conclusion
(1-2 sentence takeaway)`;
}
