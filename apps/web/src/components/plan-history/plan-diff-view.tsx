"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/provider";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";
import {
  collapseUnchanged,
  type DiffLine,
  type RequirementDiff,
} from "@/lib/plan-history/diff";

export type PlanVersionRef = {
  id: string;
  versionNumber: number;
  title: string;
  status: string;
  createdAt: string;
};

export type PlanDiffData = {
  from: PlanVersionRef | null;
  to: PlanVersionRef;
  title: { from: string | null; to: string; changed: boolean };
  lines: DiffLine[];
  stats: { added: number; removed: number };
  requirements: RequirementDiff;
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );

/**
 * Unified, line-level view of what changed between two plan versions plus a
 * requirement summary. Wraps long lines instead of scrolling sideways so it
 * stays readable on phones; colours have light and dark variants.
 */
export function PlanDiffView({ diff }: { diff: PlanDiffData }) {
  const { t, locale } = useLocale();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const items = useMemo(() => collapseUnchanged(diff.lines), [diff.lines]);
  const fromLabel = diff.from
    ? fill(t("planHistory.version"), { n: diff.from.versionNumber })
    : t("planHistory.compare.emptyPlan");
  const toLabel = fill(t("planHistory.version"), { n: diff.to.versionNumber });
  const hasLineChanges = diff.stats.added > 0 || diff.stats.removed > 0;
  const req = diff.requirements;
  const hasRequirementChanges = req.added.length + req.removed.length + req.modified.length > 0;

  return (
    <div className="min-w-0 space-y-5" data-testid="plan-diff-view">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono font-medium text-foreground">
          {fill(t("planHistory.compare.against"), { from: fromLabel, to: toLabel })}
        </span>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {fill(t("planHistory.diff.linesAdded"), { n: diff.stats.added })}
        </span>
        <span className="text-xs font-medium text-red-700 dark:text-red-300">
          {fill(t("planHistory.diff.linesRemoved"), { n: diff.stats.removed })}
        </span>
      </div>

      {diff.title.changed && (
        <div className="border border-border p-3 text-sm" data-testid="plan-diff-title">
          <div className="text-xs font-medium text-foreground-faint">{t("planHistory.diff.titleChanged")}</div>
          <div className="mt-1 break-words text-red-700 line-through dark:text-red-300">{diff.title.from}</div>
          <div className="break-words text-emerald-700 dark:text-emerald-300">{diff.title.to}</div>
        </div>
      )}

      <section aria-label={t("planHistory.diff.requirements")}>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-faint">
          {t("planHistory.diff.requirements")}
        </h4>
        {hasRequirementChanges ? (
          <ul className="space-y-1.5 text-sm">
            {req.added.map((item) => (
              <li key={`a-${item.stableKey}`} className="flex min-w-0 gap-2">
                <span className="shrink-0 font-mono text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                  + {item.stableKey}
                </span>
                <span className="min-w-0 break-words text-foreground">
                  {localizeGeneratedCopy(item.title, locale)}
                  <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                    {t("planHistory.diff.requirementsAdded")}
                  </span>
                </span>
              </li>
            ))}
            {req.removed.map((item) => (
              <li key={`r-${item.stableKey}`} className="flex min-w-0 gap-2">
                <span className="shrink-0 font-mono text-xs leading-5 text-red-700 dark:text-red-300">
                  − {item.stableKey}
                </span>
                <span className="min-w-0 break-words text-foreground-subtle line-through">
                  {localizeGeneratedCopy(item.title, locale)}
                </span>
                <span className="shrink-0 text-xs leading-5 text-red-700 dark:text-red-300">
                  {t("planHistory.diff.requirementsRemoved")}
                </span>
              </li>
            ))}
            {req.modified.map((item) => (
              <li key={`m-${item.stableKey}`} className="flex min-w-0 gap-2">
                <span className="shrink-0 font-mono text-xs leading-5 text-amber-700 dark:text-amber-300">
                  ~ {item.stableKey}
                </span>
                <span className="min-w-0 break-words text-foreground">
                  {localizeGeneratedCopy(item.toTitle, locale)}
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                    {t("planHistory.diff.requirementsModified")}:{" "}
                    {item.fields.map((field) => t(`planHistory.diff.fields.${field}`)).join(", ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-subtle">{t("planHistory.diff.noRequirementChanges")}</p>
        )}
        {req.unchanged > 0 && (
          <p className="mt-2 text-xs text-foreground-faint">
            {fill(t("planHistory.diff.requirementsUnchanged"), { n: req.unchanged })}
          </p>
        )}
      </section>

      <section aria-label={t("planHistory.diff.content")}>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-faint">
          {t("planHistory.diff.content")}
        </h4>
        {!hasLineChanges ? (
          <p className="text-sm text-foreground-subtle">{t("planHistory.diff.noChanges")}</p>
        ) : (
          <div className="overflow-hidden border border-border font-mono text-xs leading-5">
            {items.map((item, index) => {
              if (item.type === "collapsed") {
                if (expanded.has(index)) {
                  return diff.lines
                    .slice(item.startIndex, item.startIndex + item.count)
                    .map((line, offset) => (
                      <DiffRow key={`${index}-${offset}`} line={line} t={t} />
                    ));
                }
                return (
                  <button
                    key={`c-${index}`}
                    type="button"
                    onClick={() => setExpanded((current) => new Set(current).add(index))}
                    className="block w-full bg-foreground/[0.03] px-3 py-1 text-left text-foreground-faint hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {fill(t("planHistory.diff.showUnchanged"), { n: item.count })}
                  </button>
                );
              }
              return <DiffRow key={`l-${index}`} line={item} t={t} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DiffRow({ line, t }: { line: DiffLine; t: (path: string) => string }) {
  const oldNumber = line.type === "added" ? "" : line.oldNumber;
  const newNumber = line.type === "removed" ? "" : line.newNumber;
  return (
    <div
      data-diff={line.type}
      className={cn(
        "grid grid-cols-[2.25rem_2.25rem_1.25rem_minmax(0,1fr)] sm:grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)]",
        line.type === "added" && "bg-emerald-500/10 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100",
        line.type === "removed" && "bg-red-500/10 text-red-900 dark:bg-red-400/10 dark:text-red-100",
        line.type === "equal" && "text-foreground-subtle"
      )}
    >
      <span className="select-none border-r border-border px-1 text-right text-foreground-faint">{oldNumber}</span>
      <span className="select-none border-r border-border px-1 text-right text-foreground-faint">{newNumber}</span>
      <span className="flex select-none items-start justify-center pt-1">
        {line.type === "added" ? (
          <Plus className="size-3" aria-label={t("planHistory.diff.addedLine")} />
        ) : line.type === "removed" ? (
          <Minus className="size-3" aria-label={t("planHistory.diff.removedLine")} />
        ) : null}
      </span>
      <span className="whitespace-pre-wrap break-words px-2">{line.text || " "}</span>
    </div>
  );
}
