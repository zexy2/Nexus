/**
 * Prompts for the plan editor's AI actions (Summarize / Expand / Improve).
 *
 * The result is pasted straight into a new plan, so the model must return
 * ONLY the transformed text. The output language is the user's UI locale.
 */
import type { AppLocale } from "@/lib/i18n/locale";
import { languageName } from "@/lib/ai/response-language";

export type DocTextAction = "summarize" | "expand" | "improve";

const ONLY_RESULT =
  'IMPORTANT: Return only the resulting text. Do NOT add introductions such as "Sure" or "Here is", ' +
  'closing commentary, or "---" separators. Your output is pasted directly into the document.';

const ACTION_INSTRUCTIONS: Record<DocTextAction, string> = {
  summarize: "Summarize the text below.",
  expand: "Expand the text below and make it more detailed.",
  improve: "Improve the writing of the text below; make it more fluent and professional.",
};

export function buildDocActionPrompt(action: DocTextAction, text: string, locale: AppLocale): string {
  const language = languageName(locale);
  return `${ACTION_INSTRUCTIONS[action]} Write the result in ${language}.\n\n${ONLY_RESULT}\n\nTEXT:\n${text}`;
}

/** Conversational openers (TR + EN) the model sometimes still adds before a colon. */
export const AI_PREAMBLE_PATTERN = /^(elbette|i̇şte|işte|tabii?|harika|peki|sure|certainly|of course|here(?:'s| is| are))\b/i;
