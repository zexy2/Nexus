"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitPullRequestArrow,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/provider";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";

type RequirementTask = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  alignmentStatus: string;
  isArchived: number;
};

type LivingRequirement = {
  id: string;
  stableKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: string;
  changeType: string;
  confidence: number;
  tasks: RequirementTask[];
};

type LivingPlan = {
  currentVersion: {
    id: string;
    versionNumber: number;
    status: string;
    createdAt: string;
  } | null;
  requirements: LivingRequirement[];
  coverage: {
    covered: number;
    total: number;
    percentage: number;
  };
  pendingChangeSet: {
    id: string;
    status: string;
    summary: string;
    stats: Record<string, number>;
    proposalCount: number;
    workflowId: string | null;
    createdAt: string;
  } | null;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; workflowId: string; executionId: string; startedAt: number }
  | { status: "failed"; message: string };

const PLAN_ANALYSIS_TIMEOUT_MS = 120_000;

export function LivingPlanInspector({
  docId,
  savePending,
}: {
  docId: string;
  savePending: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [plan, setPlan] = useState<LivingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });

  const readableError = useCallback((error?: unknown) => {
    const message = typeof error === "string" ? error : "";
    if (/AI_PROVIDER_UNAVAILABLE|Gemini is not configured|GEMINI_API_KEY/i.test(message)) {
      return t('docs.livingPlan.aiUnavailable');
    }
    if (/Failed to initialize workflow|no such function is exported by the workflow bundle/i.test(message)) {
      return t('docs.livingPlan.workerOutdated');
    }
    return message || t('docs.livingPlan.failedRun');
  }, [t]);

  const fetchPlan = useCallback(async () => {
    const response = await fetch(`/api/plans/${docId}/living-plan`, { cache: "no-store" });
    if (!response.ok) throw new Error(t('docs.livingPlan.loadError'));
    const data = await response.json() as LivingPlan;
    setPlan(data);
    return data;
  }, [docId, t]);

  useEffect(() => {
    void fetchPlan()
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [fetchPlan]);

  useEffect(() => {
    if (analysis.status !== "running") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const current = await fetchPlan();
        if (cancelled) return;
        if (current.pendingChangeSet) {
          setAnalysis({ status: "idle" });
          return;
        }

        if (Date.now() - analysis.startedAt > PLAN_ANALYSIS_TIMEOUT_MS) {
          setAnalysis({
            status: "failed",
            message: t('docs.livingPlan.timedOut'),
          });
          return;
        }

        const response = await fetch(
          `/api/workflows?workflowId=${encodeURIComponent(analysis.workflowId)}`,
          { cache: "no-store" }
        );
        const workflow = await response.json().catch(() => null);
        if (cancelled || !response.ok) return;
        if (workflow?.status === "failed") {
          setAnalysis({
            status: "failed",
            message: readableError(workflow.error),
          });
        }
      } catch {
        // Temporary polling failures should not discard a running analysis.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [analysis, fetchPlan, readableError, t]);

  const activeRequirements = useMemo(
    () => plan?.requirements.filter((requirement) => requirement.status === "active") || [],
    [plan]
  );

  const startAnalysis = async () => {
    setAnalysis({ status: "starting" });
    try {
      const response = await fetch(`/api/plans/${docId}/analyze-change`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.changeSetId) {
        await fetchPlan();
        setAnalysis({ status: "idle" });
        return;
      }
      if (!response.ok) {
        throw new Error(
          body?.error === "AI_PROVIDER_UNAVAILABLE"
            ? t('docs.livingPlan.aiUnavailable')
            : body?.message || body?.error || t('docs.livingPlan.failedStart')
        );
      }
      setAnalysis({
        status: "running",
        workflowId: body.workflowId,
        executionId: body.executionId,
        startedAt: Date.now(),
      });
    } catch (error) {
      setAnalysis({
        status: "failed",
        message: error instanceof Error ? error.message : t('docs.livingPlan.failedStart'),
      });
    }
  };

  if (loading) {
    return (
      <aside className="border-t border-white/10 px-5 py-8 sm:px-6 lg:border-l lg:border-t-0 lg:px-7 xl:px-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </aside>
    );
  }

  return (
    <aside className="min-w-0 border-t border-white/10 px-5 py-7 sm:px-6 lg:border-l lg:border-t-0 lg:px-7 xl:px-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-white/35">
            {t('docs.livingPlan.label')}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white">
            {t('docs.livingPlan.title')}
          </h2>
        </div>
        {plan?.currentVersion && (
          <Badge variant="outline" className="border-white/10 bg-white/5 font-mono text-white/50">
            v{plan.currentVersion.versionNumber}
          </Badge>
        )}
      </div>

      <div className="mt-6 border-y border-white/10 py-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold text-white">
              {plan?.coverage.percentage || 0}%
            </div>
            <div className="mt-1 text-xs text-white/40">{t('docs.livingPlan.coverageLabel')}</div>
          </div>
          <div className="text-right text-xs text-white/45">
            {plan?.coverage.covered || 0} / {plan?.coverage.total || 0} {t('docs.livingPlan.requirementsLinked')}
          </div>
        </div>
        <Progress value={plan?.coverage.percentage || 0} className="mt-4 h-1.5" />
      </div>

      {plan?.pendingChangeSet ? (
        <div className="mt-5 border border-amber-300/20 bg-amber-300/[0.06] p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <GitPullRequestArrow className="size-4" />
            {t('docs.livingPlan.reviewRequired')}
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {localizeGeneratedCopy(plan.pendingChangeSet.summary, locale)}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-white/40">
            <span>{plan.pendingChangeSet.proposalCount} {t('docs.livingPlan.workChanges')}</span>
            <Button asChild size="sm">
              <Link href={`/dashboard/changes?changeSet=${plan.pendingChangeSet.id}`}>
                {t('docs.livingPlan.review')}
                <ArrowRight className="ml-2 size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <Button
            onClick={() => void startAnalysis()}
            disabled={savePending || analysis.status === "starting" || analysis.status === "running"}
            className="w-full"
          >
            {analysis.status === "starting" || analysis.status === "running" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {plan?.currentVersion ? t('docs.livingPlan.reviewImpact') : t('docs.livingPlan.createBaseline')}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-4 text-white/35">
            {t('docs.livingPlan.analysisHelp')}
          </p>
        </div>
      )}

      {analysis.status === "running" && (
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/45">
          <CircleDot className="mt-0.5 size-3.5 shrink-0 animate-pulse text-cyan-300" />
          {t('docs.livingPlan.running')}
        </div>
      )}
      {analysis.status === "failed" && (
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-red-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {analysis.message}
        </div>
      )}

      <div className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">{t('docs.livingPlan.requirements')}</h3>
          <span className="text-xs text-white/35">{activeRequirements.length}</span>
        </div>

        {activeRequirements.length === 0 ? (
          <div className="border-y border-white/10 py-8 text-center">
            <p className="text-sm text-white/45">{t('docs.livingPlan.noRequirements')}</p>
            <p className="mt-1 text-xs text-white/30">
              {t('docs.livingPlan.baselineHint')}
            </p>
          </div>
        ) : (
          <div className="max-h-[640px] divide-y divide-white/10 overflow-y-auto border-y border-white/10">
            {activeRequirements.map((requirement) => {
              const covered = requirement.tasks.some((task) => task.isArchived === 0);
              return (
                <div key={requirement.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-xs text-cyan-300">
                      {requirement.stableKey}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1 text-[10px] uppercase tracking-wide",
                        covered ? "text-emerald-300" : "text-amber-300"
                      )}
                    >
                      {covered ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <AlertTriangle className="size-3" />
                      )}
                      {covered ? t('docs.livingPlan.covered') : t('docs.livingPlan.uncovered')}
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium leading-5 text-white">
                    {localizeGeneratedCopy(requirement.title, locale)}
                  </div>
                  {requirement.tasks.length > 0 && (
                    <div className="mt-2 text-xs text-white/35">
                      {requirement.tasks.filter((task) => task.isArchived === 0).length} {t('docs.livingPlan.linkedTask')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
