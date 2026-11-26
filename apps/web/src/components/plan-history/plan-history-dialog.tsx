"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Loader2, RotateCcw, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/shared/toast-provider";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/provider";
import type { UndoBlockReason } from "@/lib/plan-history/eligibility";
import type { UndoConflict } from "@/lib/plan-history/undo-plan";
import { PlanDiffView, type PlanDiffData } from "./plan-diff-view";

type HistoryUser = { id: string; name: string | null } | null;

export type PlanHistoryVersion = {
  id: string;
  versionNumber: number;
  title: string;
  status: string;
  createdAt: string;
  createdBy: HistoryUser;
  baseVersionId: string | null;
  baseVersionNumber: number | null;
  requirementCount: number;
  changeSet: {
    id: string;
    status: string;
    summary: string;
    workflowId: string | null;
    createdAt: string;
    resolvedAt: string | null;
    resolvedBy: HistoryUser;
    revertsChangeSetId: string | null;
    revertsVersionNumber: number | null;
    revertedByChangeSetId: string | null;
    externalWrites: { pushed: number; providers: string[] };
    undo: { allowed: boolean; reason: UndoBlockReason | null };
  } | null;
};

type PlanHistory = {
  canUndo: boolean;
  currentVersionId: string | null;
  pendingChangeSetId: string | null;
  versions: PlanHistoryVersion[];
};

type UndoErrorCode = UndoBlockReason | "UNDO_CONFLICT" | "UNDO_UNSUPPORTED";

const KNOWN_UNDO_ERRORS = new Set<string>([
  "FORBIDDEN",
  "CHANGE_REVIEW_PENDING",
  "NOT_UNDOABLE",
  "EXTERNAL_PENDING",
  "ALREADY_REVERTED",
  "NOT_LATEST",
  "UNDO_CONFLICT",
  "UNDO_UNSUPPORTED",
]);

const PREVIOUS = "previous";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );

export function PlanHistoryDialog({
  docId,
  open,
  onOpenChange,
  onUndone,
}: {
  docId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUndone?: () => void;
}) {
  const { t, locale } = useLocale();
  const [history, setHistory] = useState<PlanHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string>(PREVIOUS);
  const [diff, setDiff] = useState<PlanDiffData | null>(null);
  const [diffState, setDiffState] = useState<"idle" | "loading" | "error">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<{ code: UndoErrorCode | null; conflicts: UndoConflict[] } | null>(null);

  const versionLabel = useCallback(
    (n: number) => fill(t("planHistory.version"), { n }),
    [t]
  );

  const loadHistory = useCallback(async (selectId?: string) => {
    try {
      const response = await fetch(`/api/plans/${docId}/versions`, { cache: "no-store" });
      if (!response.ok) throw new Error("history");
      const data = (await response.json()) as PlanHistory;
      setHistory(data);
      setHistoryError(false);
      setSelectedId((current) =>
        selectId ??
        (current && data.versions.some((version) => version.id === current)
          ? current
          : data.currentVersionId ?? data.versions[0]?.id ?? null)
      );
    } catch {
      setHistoryError(true);
    }
  }, [docId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- every setState in loadHistory runs after an await.
    void loadHistory();
  }, [open, loadHistory]);

  useEffect(() => {
    if (!open || !selectedId) return;
    let cancelled = false;
    const query = new URLSearchParams({ to: selectedId });
    if (compareId !== PREVIOUS) query.set("from", compareId);
    const run = async () => {
      setDiffState("loading");
      try {
        const response = await fetch(`/api/plans/${docId}/versions/diff?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("diff");
        const data = (await response.json()) as PlanDiffData;
        if (cancelled) return;
        setDiff(data);
        setDiffState("idle");
      } catch {
        if (!cancelled) setDiffState("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, docId, selectedId, compareId]);

  const selected = history?.versions.find((version) => version.id === selectedId) ?? null;
  const changeSet = selected?.changeSet ?? null;

  const selectVersion = (id: string) => {
    setSelectedId(id);
    setCompareId(PREVIOUS);
    setUndoError(null);
  };

  const undo = async () => {
    if (!changeSet) return;
    setUndoing(true);
    try {
      const response = await fetch(`/api/change-sets/${changeSet.id}/undo`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code =
          response.status === 403
            ? "FORBIDDEN"
            : typeof body?.error === "string" && KNOWN_UNDO_ERRORS.has(body.error)
              ? (body.error as UndoErrorCode)
              : null;
        setUndoError({ code, conflicts: Array.isArray(body?.conflicts) ? body.conflicts : [] });
        setConfirmOpen(false);
        await loadHistory();
        return;
      }
      setConfirmOpen(false);
      setUndoError(null);
      showToast.success(fill(t("planHistory.undo.success"), { n: body.versionNumber }), {
        description:
          body.externalNotReverted > 0
            ? fill(t("planHistory.undo.successExternal"), { n: body.externalNotReverted })
            : undefined,
      });
      setCompareId(PREVIOUS);
      await loadHistory(body.versionId);
      onUndone?.();
    } catch {
      setUndoError({ code: null, conflicts: [] });
      setConfirmOpen(false);
    } finally {
      setUndoing(false);
    }
  };

  const compareOptions = history?.versions.filter((version) => version.id !== selectedId) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(92dvh,900px)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        data-testid="plan-history-dialog"
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle>{t("planHistory.title")}</DialogTitle>
          <DialogDescription>{t("planHistory.description")}</DialogDescription>
        </DialogHeader>

        {historyError ? (
          <div role="alert" className="flex items-start gap-2 p-5 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{t("planHistory.loadError")}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => void loadHistory()}>
              {t("ux.retry")}
            </Button>
          </div>
        ) : !history ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.versions.length === 0 ? (
          <p className="p-5 text-sm text-foreground-subtle">{t("planHistory.empty")}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <nav
              aria-label={t("planHistory.versions")}
              className="max-h-48 shrink-0 overflow-y-auto border-b border-border md:max-h-none md:w-72 md:border-b-0 md:border-r"
            >
              <ul className="divide-y divide-border">
                {history.versions.map((version) => {
                  const isSelected = version.id === selectedId;
                  const isCurrent = version.id === history.currentVersionId;
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => selectVersion(version.id)}
                        aria-current={isSelected ? "true" : undefined}
                        className={cn(
                          "block w-full px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          isSelected && "bg-foreground/[0.06]"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {versionLabel(version.versionNumber)}
                          </span>
                          <StatusBadge status={version.status} t={t} />
                          {isCurrent && (
                            <Badge variant="outline" className="border-cyan-600/30 text-cyan-800 dark:border-cyan-300/30 dark:text-cyan-200">
                              {t("planHistory.current")}
                            </Badge>
                          )}
                          {version.changeSet?.revertedByChangeSetId && (
                            <Badge variant="outline" className="border-border text-foreground-subtle">
                              {t("planHistory.revertedBadge")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-foreground-faint">
                          {formatRelativeDate(version.createdAt, locale)}
                          {" · "}
                          {fill(t("planHistory.createdBy"), {
                            name: version.createdBy?.name || t("planHistory.unknownUser"),
                          })}
                        </div>
                        {version.changeSet?.revertsChangeSetId && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                            <Undo2 className="size-3" />
                            {version.changeSet.revertsVersionNumber
                              ? fill(t("planHistory.revertOf"), { n: version.changeSet.revertsVersionNumber })
                              : t("planHistory.revertOfUnknown")}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
              {selected && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-base font-semibold text-foreground">
                        {versionLabel(selected.versionNumber)}
                      </h3>
                      <StatusBadge status={selected.status} t={t} />
                      <span className="text-xs text-foreground-faint">
                        {fill(t("planHistory.requirementCount"), { n: selected.requirementCount })}
                      </span>
                    </div>
                    <p className="break-words text-sm text-foreground-subtle">
                      {formatDateTime(selected.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}
                      {" · "}
                      {fill(t("planHistory.createdBy"), {
                        name: selected.createdBy?.name || t("planHistory.unknownUser"),
                      })}
                    </p>

                    {changeSet ? (
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-foreground-faint">{t("planHistory.changeSet")}</dt>
                        <dd className="min-w-0 text-foreground-secondary">
                          {t(`changes.status.${changeSet.status}`)}
                          {" · "}
                          <Link
                            href={`/dashboard/changes?changeSet=${changeSet.id}`}
                            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                          >
                            {t("planHistory.openReview")}
                            <ArrowRight className="size-3" />
                          </Link>
                        </dd>
                        {changeSet.workflowId && (
                          <>
                            <dt className="text-foreground-faint">{t("planHistory.workflow")}</dt>
                            <dd className="truncate font-mono text-foreground-secondary" title={changeSet.workflowId}>
                              {changeSet.workflowId}
                            </dd>
                          </>
                        )}
                      </dl>
                    ) : (
                      <p className="text-xs text-foreground-faint">{t("planHistory.noChangeSet")}</p>
                    )}

                    {changeSet && changeSet.externalWrites.pushed > 0 && (
                      <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-900 dark:border-amber-300/20 dark:text-amber-100">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        {fill(t("planHistory.externalPushed"), { n: changeSet.externalWrites.pushed })}
                      </div>
                    )}

                    {changeSet && (changeSet.undo.allowed || changeSet.undo.reason !== "NOT_UNDOABLE") && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!changeSet.undo.allowed || undoing}
                          onClick={() => {
                            setUndoError(null);
                            setConfirmOpen(true);
                          }}
                          data-testid="plan-history-undo"
                        >
                          <RotateCcw className="mr-2 size-3.5" />
                          {t("planHistory.undo.button")}
                        </Button>
                        {!changeSet.undo.allowed && changeSet.undo.reason && (
                          <span className="text-xs text-foreground-faint">
                            {t(`planHistory.undo.reason.${changeSet.undo.reason}`)}
                          </span>
                        )}
                      </div>
                    )}

                    {undoError && (
                      <div
                        role="alert"
                        className="border border-red-500/30 bg-red-500/[0.06] p-3 text-xs leading-5 text-red-900 dark:border-red-300/20 dark:text-red-100"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            {undoError.code
                              ? t(`planHistory.undo.reason.${undoError.code}`)
                              : t("planHistory.undo.failed")}
                          </span>
                        </div>
                        {undoError.conflicts.length > 0 && (
                          <div className="mt-2 pl-5">
                            <div>{t("planHistory.undo.conflictTitle")}</div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                              {undoError.conflicts.map((conflict) => (
                                <li key={conflict.taskId} className="break-words">
                                  {conflict.title} — {t(`planHistory.undo.conflict.${conflict.reason}`)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-4">
                    <label className="flex flex-col gap-1.5 text-xs text-foreground-faint sm:flex-row sm:items-center sm:gap-3">
                      {t("planHistory.compare.label")}
                      <select
                        value={compareId}
                        onChange={(event) => setCompareId(event.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value={PREVIOUS}>{t("planHistory.compare.previous")}</option>
                        {compareOptions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {versionLabel(version.versionNumber)} · {t(`planHistory.status.${version.status}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {diffState === "error" ? (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                      {t("planHistory.diffLoadError")}
                    </p>
                  ) : diffState === "loading" || !diff ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <PlanDiffView diff={diff} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !undoing && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("planHistory.undo.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {selected?.baseVersionNumber
                    ? fill(t("planHistory.undo.confirmRestore"), { n: selected.baseVersionNumber })
                    : t("planHistory.undo.confirmClear")}
                </p>
                <p>{t("planHistory.undo.confirmTasks")}</p>
                <p>{t("planHistory.undo.confirmEditor")}</p>
                {changeSet && changeSet.externalWrites.pushed > 0 && (
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {fill(t("planHistory.undo.confirmExternal"), { n: changeSet.externalWrites.pushed })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void undo()}
              disabled={undoing}
              data-testid="plan-history-undo-confirm"
            >
              {undoing && <Loader2 className="size-4 animate-spin" />}
              {t("planHistory.undo.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function StatusBadge({ status, t }: { status: string; t: (path: string) => string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border text-foreground-subtle",
        status === "accepted" && "border-emerald-600/30 text-emerald-800 dark:border-emerald-300/30 dark:text-emerald-200",
        status === "proposed" && "border-amber-600/30 text-amber-800 dark:border-amber-300/30 dark:text-amber-200"
      )}
    >
      {t(`planHistory.status.${status}`)}
    </Badge>
  );
}
