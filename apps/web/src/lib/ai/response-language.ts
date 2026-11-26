/**
 * Which language an AI answer should be written in.
 *
 * The UI locale wins when the client sent one; otherwise the model mirrors the
 * language of the user's own input (never a hardcoded Turkish default).
 */
import type { AppLocale } from "@/lib/i18n/locale";

export function languageName(locale: AppLocale): string {
  return locale === "tr" ? "Turkish" : "English";
}

/** One-line system-prompt instruction for the response language. */
export function responseLanguageInstruction(locale: AppLocale | undefined): string {
  if (!locale) {
    return "Respond in the same language as the user's latest message.";
  }
  const name = languageName(locale);
  return `Respond in ${name}, regardless of the language of any context, sources or earlier messages. Code, identifiers and quoted source text may stay as they are.`;
}

/**
 * Cheap heuristic used for short server-side strings (e.g. "Created tasks")
 * when the client sent no locale: Turkish when the text clearly looks Turkish.
 */
export function detectTextLocale(text: string): AppLocale {
  const lower = text.toLocaleLowerCase("tr-TR");
  let score = /[çğıöşü]/.test(lower) ? 2 : 0;
  if (/\b(ve|bir|bu|için|ile|nasıl|nedir|lütfen|görev|oluştur|yaz|kaydet|plan[ıi])\b/u.test(lower)) score += 2;
  return score >= 2 ? "tr" : "en";
}

/** Locale for server-generated copy: explicit UI locale, else guessed from the input. */
export function serverCopyLocale(locale: AppLocale | undefined, userText: string): AppLocale {
  return locale ?? detectTextLocale(userText);
}
