/**
 * Shared date/number formatting so every surface renders time the same way.
 *
 * Before this, each page had its own ad-hoc `formatDate` (some returned
 * "27.01.2026", others "6d ago", others "6 gün önce"), which read as three
 * different apps. `formatRelativeDate` is the single source of truth: relative
 * for recent timestamps, absolute (locale-aware) once they age out.
 */

export type AppLocale = "tr" | "en";

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const RELATIVE_STRINGS: Record<AppLocale, {
  justNow: string;
  minutes: (n: number) => string;
  hours: (n: number) => string;
  days: (n: number) => string;
}> = {
  tr: {
    justNow: "az önce",
    minutes: (n) => `${n} dakika önce`,
    hours: (n) => `${n} saat önce`,
    days: (n) => `${n} gün önce`,
  },
  en: {
    justNow: "just now",
    minutes: (n) => `${n}m ago`,
    hours: (n) => `${n}h ago`,
    days: (n) => `${n}d ago`,
  },
};

/**
 * Relative for the last week, absolute (DD.MM.YYYY in TR, locale default in EN)
 * after that. Use everywhere a timestamp is shown in a list or card.
 */
export function formatRelativeDate(value: DateInput, locale: AppLocale = "tr"): string {
  const date = toDate(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const s = RELATIVE_STRINGS[locale];

  if (minutes < 1) return s.justNow;
  if (minutes < 60) return s.minutes(minutes);
  if (hours < 24) return s.hours(hours);
  if (days < 7) return s.days(days);
  return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US");
}

/** Absolute date+time, for detail views and tooltips. */
export function formatDateTime(value: DateInput, locale: AppLocale = "tr"): string {
  return toDate(value).toLocaleString(locale === "tr" ? "tr-TR" : "en-US");
}
