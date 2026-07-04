"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  FileText,
  GitPullRequestArrow,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/shared/toast-provider";
import { useT, useLocale } from "@/lib/i18n/provider";
import { formatRelativeDate } from "@/lib/format";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";

type ChangeSetSummary = {
  id: string;
  docId: string;
  docTitle: string;
  status: string;
  summary: string;
  stats: Record<string, number>;
  workflowId: string | null;
  proposals: {
    total: number;
    pending: number;
    applied: number;
    rejected: number;
  };
  createdAt: string;
  resolvedAt: string | null;
};

type ChangeProposal = {
  id: string;
  action: string;
  title: string;
  description: string | null;
  priority: string | null;
  rationale: string;
  confidence: number;
  status: string;
  metadata: Record<string, unknown> | null;
  externalOperations: Array<{
    id: string;
    provider: string;
    operationType: string;
    status: string;
    error: string | null;
    attemptCount: number;
    attemptedAt: string | null;
    completedAt: string | null;
  }>;
  requirement: {
    id: string;
    stableKey: string | null;
    title: string | null;
  } | null;
  task: {
    id: string;
    title: string | null;
    status: string | null;
    alignmentStatus: string | null;
  } | null;
};

type ChangeSetDetail = Omit<ChangeSetSummary, "proposals"> & {
  proposals: ChangeProposal[];
};

const statusStyles: Record<string, string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  pending_external: "border-purple-400/30 bg-purple-400/10 text-purple-200",
  external_pending: "border-purple-400/30 bg-purple-400/10 text-purple-200",
  running: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  applied: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  failed_retryable: "border-red-400/30 bg-red-400/10 text-red-200",
  failed_terminal: "border-red-400/30 bg-red-400/10 text-red-200",
  partially_applied: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  external_failed: "border-red-400/30 bg-red-400/10 text-red-200",
  rejected: "border-white/10 bg-white/5 text-white/50",
  expired: "border-white/10 bg-white/5 text-white/40",
};

export default function ChangesPage() {
  const t = useT();
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const requestedChangeSetId = searchParams.get("changeSet");
  const [changeSets, setChangeSets] = useState<ChangeSetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChangeSetDetail | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<"apply" | "reject" | null>(null);

  const displayDocTitle = useCallback((value: string) => {
    return localizeGeneratedCopy(
      value === "Generated Document" ? t("docs.detail.generatedTitle") : value,
      locale
    );
  }, [locale, t]);

  const displayGeneratedCopy = useCallback((value: string | null | undefined) => {
    return localizeGeneratedCopy(value, locale);
  }, [locale]);

  const statusLabel = useCallback((status: string) => {
    if (
      status === "pending" ||
      status === "applied" ||
      status === "partially_applied" ||
      status === "rejected" ||
      status === "expired"
    ) {
      return t(`changes.status.${status}`);
    }
    if (status === "external_pending") {
      return locale === "tr" ? "dış yazım bekliyor" : "external pending";
    }
    if (status === "pending_external") {
      return locale === "tr" ? "dış yazım kuyruğunda" : "external queued";
    }
    if (status === "external_failed") {
      return locale === "tr" ? "dış yazım başarısız" : "external write failed";
    }
    return status;
  }, [locale, t]);

  const operationStatusLabel = useCallback((status: string) => {
    const labels: Record<string, [string, string]> = {
      pending: ["Kuyrukta", "Queued"],
      running: ["Uygulanıyor", "Running"],
      succeeded: ["Tamamlandı", "Completed"],
      failed_retryable: ["Yeniden denenebilir", "Retryable failure"],
      failed_terminal: ["Uygulanamadı", "Terminal failure"],
    };
    const pair = labels[status];
    return pair ? pair[locale === "tr" ? 0 : 1] : status;
  }, [locale]);

  const operationPassiveLabel = useCallback((status: string) => {
    const labels: Record<string, [string, string]> = {
      pending: ["Otomatik uygulanacak", "Will run automatically"],
      running: ["Uygulanıyor", "Running"],
      succeeded: ["Tamamlandı", "Completed"],
      failed_terminal: ["Tekrar denenemez", "Cannot retry"],
    };
    const pair = labels[status];
    return pair ? pair[locale === "tr" ? 0 : 1] : operationStatusLabel(status);
  }, [locale, operationStatusLabel]);

  const actionLabel = useCallback((action: string) => {
    const fallback: Record<string, string> = {
      linear_create_issue: locale === "tr" ? "Linear issue oluştur" : "Create Linear issue",
      linear_update_issue: locale === "tr" ? "Linear issue güncelle" : "Update Linear issue",
      linear_comment: locale === "tr" ? "Linear yorum ekle" : "Add Linear comment",
      github_create_issue: locale === "tr" ? "GitHub issue oluştur" : "Create GitHub issue",
      github_issue_comment: locale === "tr" ? "GitHub yorum ekle" : "Add GitHub comment",
      github_issue_update: locale === "tr" ? "GitHub issue güncelle" : "Update GitHub issue",
      github_issue_label: locale === "tr" ? "GitHub label güncelle" : "Update GitHub label",
      mark_agent_job_outdated: locale === "tr" ? "Agent işini eski işaretle" : "Mark agent job outdated",
    };
    return fallback[action] || t(`changes.action.${action}`);
  }, [locale, t]);

  const fetchChangeSets = useCallback(async () => {
    const response = await fetch("/api/change-sets", { cache: "no-store" });
    if (!response.ok) throw new Error(t("changes.loadError"));
    const rows = await response.json() as ChangeSetSummary[];
    setChangeSets(rows);
    setSelectedId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      if (
        requestedChangeSetId &&
        rows.some((row) => row.id === requestedChangeSetId)
      ) {
        return requestedChangeSetId;
      }
      return rows.find((row) => row.status === "pending")?.id || rows[0]?.id || null;
    });
  }, [requestedChangeSetId, t]);

  const fetchDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/change-sets/${id}`, { cache: "no-store" });
    if (!response.ok) throw new Error(t("changes.detailLoadError"));
    const next = await response.json() as ChangeSetDetail;
    setDetail(next);
    setSelectedProposalIds(
      new Set(
        next.proposals
          .filter((proposal) => proposal.status === "pending")
          .map((proposal) => proposal.id)
      )
    );
  }, [t]);

  useEffect(() => {
    void fetchChangeSets()
      .catch((error) => showToast.error(error instanceof Error ? error.message : t("changes.loadError")))
      .finally(() => setLoading(false));
  }, [fetchChangeSets, t]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetchDetail(selectedId).catch((error) =>
      showToast.error(error instanceof Error ? error.message : t("changes.detailLoadError"))
    );
  }, [fetchDetail, selectedId, t]);

  useEffect(() => {
    const hasPending = changeSets.some((changeSet) =>
      changeSet.status === "pending" || changeSet.status === "external_pending"
    );
    const hasPendingOperation = detail?.proposals.some((proposal) =>
      proposal.externalOperations.some((operation) =>
        operation.status === "pending" || operation.status === "running"
      )
    ) ?? false;
    if (!hasPending && !hasPendingOperation && !resolving) return;

    const timer = window.setInterval(() => {
      void fetchChangeSets();
      if (selectedId) void fetchDetail(selectedId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [changeSets, detail, fetchChangeSets, fetchDetail, resolving, selectedId]);

  const pendingProposals = useMemo(
    () => detail?.proposals.filter((proposal) => proposal.status === "pending") || [],
    [detail]
  );

  const resolutionCopy = useMemo(() => {
    if (!detail || detail.status === "pending") return null;
    if (detail.status === "partially_applied") {
      return {
        title: t("changes.resolution.partialTitle"),
        description: t("changes.resolution.partialDesc"),
        className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
      };
    }
    if (detail.status === "applied") {
      return {
        title: t("changes.resolution.appliedTitle"),
        description: t("changes.resolution.appliedDesc"),
        className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
      };
    }
    if (detail.status === "external_pending") {
      return {
        title: locale === "tr" ? "Dış sistem yazımları bekliyor" : "External writes are pending",
        description:
          locale === "tr"
            ? "Plan kabul edildi. GitHub ve Linear güncellemeleri otomatik olarak uygulanıyor."
            : "The plan was accepted. GitHub and Linear updates are being applied automatically.",
        className: "border-purple-400/20 bg-purple-400/10 text-purple-100",
      };
    }
    if (detail.status === "external_failed") {
      return {
        title: locale === "tr" ? "Dış sistem güncellemesi başarısız" : "External update failed",
        description:
          locale === "tr"
            ? "Internal değişiklik yapılmadı veya dış yazımlar tamamlanamadı. Aşağıdaki hata ayrıntısını inceleyip operasyonu yeniden deneyin."
            : "No internal change was applied or the external writes could not complete. Review the error and retry the failed operation.",
        className: "border-red-400/20 bg-red-400/10 text-red-100",
      };
    }
    if (detail.status === "expired") {
      return {
        title: t("changes.resolution.expiredTitle"),
        description: t("changes.resolution.expiredDesc"),
        className: "border-white/10 bg-white/[0.04] text-white/65",
      };
    }
    return {
      title: t("changes.resolution.rejectedTitle"),
      description: t("changes.resolution.rejectedDesc"),
      className: "border-white/10 bg-white/[0.04] text-white/65",
    };
  }, [detail, locale, t]);

  const toggleProposal = (id: string) => {
    setSelectedProposalIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resolveChangeSet = async (decision: "apply" | "reject") => {
    if (!detail) return;
    setResolving(decision);
    try {
      const response = await fetch(`/api/change-sets/${detail.id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProposalIds: Array.from(selectedProposalIds),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.error === "CHANGE_SET_ALREADY_RESOLVED" || body?.error === "CHANGE_SET_NOT_PENDING") {
          showToast.success(
            locale === "tr"
              ? "Bu plan sürümü daha önce sonuçlandırıldı."
              : "This plan version has already been resolved."
          );
          await fetchChangeSets();
          await fetchDetail(detail.id);
          return;
        }
        throw new Error(body?.message || body?.error || t("changes.resolveError"));
      }
      if (body?.alreadyResolved) {
        showToast.success(
          locale === "tr"
            ? "Bu plan sürümü daha önce sonuçlandırıldı."
            : "This plan version has already been resolved."
        );
        await fetchChangeSets();
        await fetchDetail(detail.id);
        return;
      }
      showToast.success(
        decision === "apply" && (body?.status === "applying" || body?.recovery || body?.status === "external_pending")
          ? locale === "tr"
            ? "Uygulama başlatıldı. Terminal durum bekleniyor."
            : "Apply started. Waiting for the terminal state."
          : decision === "apply"
            ? t("changes.appliedToast")
            : t("changes.rejectedToast")
      );
      await fetchChangeSets();
      await fetchDetail(detail.id);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t("changes.resolveError"));
    } finally {
      setResolving(null);
    }
  };

  const retryExternalOperation = async (operationId: string) => {
    try {
      const response = await fetch(`/api/external-write-operations/${operationId}/retry`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "External write failed");
      }
      showToast.success(locale === "tr" ? "Dış sistem yazımı yeniden kuyruğa alındı" : "External write queued again");
      if (detail) await fetchDetail(detail.id);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "External write failed");
    }
  };

  const appliedTaskCount = detail?.proposals.filter(
    (proposal) => proposal.status === "applied" && proposal.task?.id
  ).length || 0;

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-24 pt-10 md:px-8">
      <header className="mb-10 flex flex-col justify-between gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-300">
            <GitPullRequestArrow className="size-4" />
            {t("changes.label")}
          </div>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{t("changes.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {t("changes.description")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void fetchChangeSets()} className="gap-2">
          <RefreshCw className="size-4" />
          {t("common.refresh")}
        </Button>
      </header>

      {changeSets.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center border-y border-white/10 text-center">
          <CheckCircle2 className="mb-4 size-9 text-emerald-300" />
          <h2 className="text-xl font-medium text-white">{t("changes.emptyTitle")}</h2>
          <p className="mt-2 max-w-md text-sm text-white/50">
            {t("changes.emptyDesc")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/docs">{t("changes.openPlans")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-r border-white/10 pr-0 lg:pr-6">
            <div className="space-y-1">
              {changeSets.map((changeSet) => (
                <button
                  key={changeSet.id}
                  onClick={() => setSelectedId(changeSet.id)}
                  className={cn(
                    "w-full border-l-2 px-4 py-4 text-left transition-colors",
                    selectedId === changeSet.id
                      ? "border-white bg-white/[0.06]"
                      : "border-transparent hover:border-white/20 hover:bg-white/[0.03]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-white">
                      {displayDocTitle(changeSet.docTitle)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0", statusStyles[changeSet.status])}
                    >
                      {statusLabel(changeSet.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/45">
                    {displayGeneratedCopy(changeSet.summary)}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-white/35">
                    <span>{changeSet.proposals.total} {t("changes.proposals")}</span>
                    <span>{formatRelativeDate(changeSet.createdAt, locale)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0">
            {!detail ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-6 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(statusStyles[detail.status])}
                      >
                        {statusLabel(detail.status)}
                      </Badge>
                      <span className="font-mono text-xs text-white/35">
                        {detail.id.slice(0, 8)}
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">{displayDocTitle(detail.docTitle)}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                      {displayGeneratedCopy(detail.summary)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/docs/${detail.docId}`}>
                        <FileText className="mr-2 size-4" />
                        {t("changes.openPlan")}
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/tasks">
                        {t("changes.openWork")}
                        <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px border-b border-white/10 bg-white/10 sm:grid-cols-5">
                  {[
                    [t("changes.stats.added"), detail.stats.added || 0],
                    [t("changes.stats.modified"), detail.stats.modified || 0],
                    [t("changes.stats.removed"), detail.stats.removed || 0],
                    [t("changes.stats.unchanged"), detail.stats.unchanged || 0],
                    [t("changes.stats.proposals"), detail.proposals.length],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="bg-background px-4 py-5">
                      <div className="text-2xl font-semibold text-white">{value}</div>
                      <div className="mt-1 text-xs text-white/40">{label}</div>
                    </div>
                  ))}
                </div>

                {resolutionCopy && (
                  <div className={cn("mt-6 border px-5 py-4", resolutionCopy.className)}>
                    <div className="text-sm font-semibold">{resolutionCopy.title}</div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 opacity-75">
                      {resolutionCopy.description}
                    </p>
                  </div>
                )}

                {appliedTaskCount > 0 && detail.status !== "pending" && (
                  <div className="mt-4 flex flex-col justify-between gap-3 border border-white/10 px-5 py-4 sm:flex-row sm:items-center">
                    <span className="text-sm text-white/65">
                      {locale === "tr"
                        ? `${appliedTaskCount} görev teslimat panosuna uygulandı.`
                        : `${appliedTaskCount} tasks were applied to the delivery board.`}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/tasks">
                        {locale === "tr" ? "İşleri aç" : "Open work"}
                        <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  </div>
                )}

                <div className="py-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{t("changes.proposedTitle")}</h3>
                      <p className="mt-1 text-xs text-white/40">
                        {t("changes.proposedDesc")}
                      </p>
                    </div>
                    {detail.status === "pending" && pendingProposals.length > 0 && (
                      <button
                        className="text-xs text-white/50 hover:text-white"
                        onClick={() =>
                          setSelectedProposalIds(
                            selectedProposalIds.size === pendingProposals.length
                              ? new Set()
                              : new Set(pendingProposals.map((proposal) => proposal.id))
                          )
                        }
                      >
                        {selectedProposalIds.size === pendingProposals.length
                          ? t("changes.clearSelection")
                          : t("changes.selectAll")}
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-white/10 border-y border-white/10">
                    {detail.proposals.map((proposal) => (
                      <label
                        key={proposal.id}
                        className={cn(
                          "grid gap-4 py-5 md:grid-cols-[24px_130px_minmax(0,1fr)_90px]",
                          proposal.status !== "pending" && "opacity-55"
                        )}
                      >
                        <div className="pt-0.5">
                          {proposal.status === "pending" ? (
                            <Checkbox
                              checked={selectedProposalIds.has(proposal.id)}
                              onCheckedChange={() => toggleProposal(proposal.id)}
                              aria-label={`${t("changes.selectProposal")} ${displayGeneratedCopy(proposal.title)}`}
                            />
                          ) : proposal.status === "applied" ? (
                            <Check className="size-4 text-emerald-300" />
                          ) : (
                            <X className="size-4 text-white/35" />
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="border-white/10 bg-white/5 text-white/60">
                            {actionLabel(proposal.action)}
                          </Badge>
                          {proposal.requirement?.stableKey && (
                            <div className="mt-2 font-mono text-xs text-cyan-300">
                              {proposal.requirement.stableKey}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white">
                            {displayGeneratedCopy(proposal.title)}
                          </div>
                          <p className="mt-1 text-sm leading-5 text-white/45">
                            {displayGeneratedCopy(proposal.rationale)}
                          </p>
                          {proposal.task?.title && (
                            <p className="mt-2 text-xs text-white/35">
                              {t("changes.currentTask")}: {displayGeneratedCopy(proposal.task.title)}
                            </p>
                          )}
                          {proposal.externalOperations.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {proposal.externalOperations.map((operation) => (
                                <div
                                  key={operation.id}
                                  className="flex flex-col gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div>
                                    <span className="font-mono uppercase text-white/35">
                                      {operation.provider}
                                    </span>{" "}
                                    <span>{actionLabel(operation.operationType)}</span>
                                    <Badge
                                      variant="outline"
                                      className={cn("ml-2", statusStyles[operation.status] || "border-white/10 bg-white/5")}
                                    >
                                      {operationStatusLabel(operation.status)}
                                    </Badge>
                                    <span className="ml-2 text-white/35">
                                      {operation.attemptCount} {locale === "tr" ? "deneme" : "attempts"}
                                    </span>
                                    {operation.error && (
                                      <p className="mt-1 text-red-300">{operation.error}</p>
                                    )}
                                  </div>
                                  {operation.status === "failed_retryable" ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        void retryExternalOperation(operation.id);
                                      }}
                                    >
                                      {locale === "tr" ? "Yeniden dene" : "Retry"}
                                    </Button>
                                  ) : (
                                    <span className="text-right text-[11px] text-white/35">
                                      {operationPassiveLabel(operation.status)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-white/50">
                            {proposal.confidence}%
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-white/30">
                            {t("changes.confidence")}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {detail.status === "pending" && (
                  <div className="sticky bottom-4 flex flex-col justify-between gap-4 border border-white/10 bg-black/90 p-4 backdrop-blur-xl sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <CircleDot className="size-4 text-amber-300" />
                      <div>
                        <div className="text-sm font-medium text-white">
                          {selectedProposalIds.size} / {pendingProposals.length} {t("changes.selected")}
                        </div>
                        <div className="text-xs text-white/40">
                          {t("changes.unselectedRejected")}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void resolveChangeSet("reject")}
                        disabled={resolving !== null}
                      >
                        {resolving === "reject" ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 size-4" />
                        )}
                        {t("changes.rejectPlan")}
                      </Button>
                      <Button
                        onClick={() => void resolveChangeSet("apply")}
                        disabled={resolving !== null || selectedProposalIds.size === 0}
                      >
                        {resolving === "apply" && (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        )}
                        {t("changes.applySelected")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
