"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/provider";
import { LOCALES } from "@/lib/i18n/messages";

/**
 * Compact TR/EN switch. Persists through the same `setLocale` as the Settings
 * option (localStorage + cookie, so the next server render matches).
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      data-testid="locale-toggle"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-foreground/[0.03] p-0.5 text-[11px] font-semibold",
        className
      )}
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={active}
            title={t(`common.languageName.${option}`)}
            onClick={() => {
              if (!active) setLocale(option);
            }}
            className={cn(
              "rounded-full px-2 py-1 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
