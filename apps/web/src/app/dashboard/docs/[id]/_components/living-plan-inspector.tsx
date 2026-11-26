"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitPullRequestArrow,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/provider";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";
import { localeHeaders } from "@/lib/i18n/locale";
import { aiErrorFromBody, formatAiError, isAiQuotaError, notifyAiQuotaChanged } from "@/lib/ai/ai-errors";
import { AiQuotaBadge } from "@/components/shared/ai-quota-badge";
import { friendlyError } from "@/lib/friendly-error";
import {
  LIVING_PLAN_ANALYSIS_STARTED_EVENT,
  type LivingPlanAnalysisStartedDetail,
} from "@/components/demo/demo-tour-card";

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
  /** Latest plan-impact run for this doc (server state, survives reloads). */
  latestAnalysis?: {
    executionId: string;
    workflowId: string | null;
    status: string;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
};

type ImpactGraph = {
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    accountName: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    seeded: boolean;
    config?: { selectedRepository?: string | null };
  }>;
  diagnostics: Array<
    | "NO_INTEGRATION"
    | "NO_SYNCED_ISSUES"
    | "NO_REQUIREMENT_MATCHES"
    | "NO_LINKED_PRS"
    | "NO_CHECK_RUNS"
  >;
  summary: {
    requirements: number;
    externalIssues: number;
    pullRequests: number;
    checkRuns: number;
    outdatedAgentJobs: number;
    missingCoverage: number;
    orphanedExternalWork: number;
  };
  requirements: Array<{
    id: string;
    stableKey: string;
    title: string;
    externalIssues: Array<{
      id: string;
      provider: string;
      key: string | null;
      title: string;
      status: string;
      url: string | null;
    }>;
    pullRequests: Array<{
      id: string;
      number: number;
      title: string;
      status: string;
      url: string | null;
    }>;
    checkRuns: Array<{
      id: string;
      name: string;
      status: string;
      conclusion: string | null;
      url: string | null;
    }>;
    agentJobs: Array<{
      id: string;
      status: string;
      client: string | null;
    }>;
  }>;
  orphanedExternalIssues: Array<{
    id: string;
    provider: string;
    key: string | null;
    title: string;
    status: string;
    url: string | null;
  }>;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; workflowId: string; executionId: string; startedAt: number }
  | { status: "failed"; message: string };

// After this long the panel says the run is slow, but keeps following the
// server's status: the workflow may still finish (it used to be marked failed).
const PLAN_ANALYSIS_SLOW_MS = 120_000;
const ACTIVE_RUN_STATUSES = new Set(["pending", "running"]);

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
  const [impactGraph, setImpactGraph] = useState<ImpactGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [slow, setSlow] = useState(false);

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

  const fetchImpactGraph = useCallback(async () => {
    const response = await fetch(`/api/impact-graph?docId=${encodeURIComponent(docId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json() as ImpactGraph;
    setImpactGraph(data);
    return data;
  }, [docId]);

  const loadInitial = useCallback(async () => {
    try {
      const data = await fetchPlan();
      setLoadFailed(false);
      // Resume an analysis that is still running on the server (e.g. after a
      // reload or when another tab started it).
      const run = data.latestAnalysis;
      if (!data.pendingChangeSet && run?.workflowId && ACTIVE_RUN_STATUSES.has(run.status)) {
        const startedAt = Date.parse(run.createdAt);
        setAnalysis({
          status: "running",
          workflowId: run.workflowId,
          executionId: run.executionId,
          startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
        });
      }
      void fetchImpactGraph();
    } catch {
      // Never fall through to "Create baseline" on a failed load.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [fetchImpactGraph, fetchPlan]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- false positive: React Compiler treats the async body as synchronous; every setState in it runs after an await.
    void loadInitial();
  }, [loadInitial]);

  // The demo guided tour can start the analysis from outside this panel;
  // follow that run exactly as if the panel's own button had started it.
  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<LivingPlanAnalysisStartedDetail>).detail;
      if (!detail || detail.docId !== docId) return;
      setAnalysis({
        status: "running",
        workflowId: detail.workflowId,
        executionId: detail.executionId,
        startedAt: Date.now(),
      });
    };
    window.addEventListener(LIVING_PLAN_ANALYSIS_STARTED_EVENT, onStarted);
    return () => window.removeEventListener(LIVING_PLAN_ANALYSIS_STARTED_EVENT, onStarted);
  }, [docId]);

  useEffect(() => {
    if (analysis.status !== "running") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const current = await fetchPlan();
        void fetchImpactGraph();
        if (cancelled) return;
        if (current.pendingChangeSet) {
          setAnalysis({ status: "idle" });
          setSlow(false);
          return;
        }

        setSlow(Date.now() - analysis.startedAt > PLAN_ANALYSIS_SLOW_MS);

        // The server reconciles the run with Temporal; trust its terminal state.
        const response = await fetch(
          `/api/workflows?workflowId=${encodeURIComponent(analysis.workflowId)}`,
          { cache: "no-store" }
        );
        const workflow = await response.json().catch(() => null);
        if (cancelled || !response.ok) return;
        if (workflow?.status === "failed") {
          setSlow(false);
          setAnalysis({
            status: "failed",
            message: readableError(workflow.error),
          });
        } else if (workflow?.status === "completed") {
          // Finished without a review to open (e.g. no impactful changes).
          setSlow(false);
          setAnalysis({ status: "idle" });
          await fetchPlan();
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
  }, [analysis, fetchImpactGraph, fetchPlan, readableError, t]);

  const activeRequirements = useMemo(
    () => plan?.requirements.filter((requirement) => requirement.status === "active") || [],
    [plan]
  );

  const graphRequirementsWithExternalWork = useMemo(
    () =>
      (impactGraph?.requirements || []).filter(
        (requirement) =>
          requirement.externalIssues.length > 0 ||
          requirement.pullRequests.length > 0 ||
          requirement.checkRuns.length > 0 ||
          requirement.agentJobs.length > 0
      ),
    [impactGraph]
  );

  const graphDiagnostic = useMemo(() => {
    const code = impactGraph?.diagnostics?.[0];
    if (!code) return null;
    const base = `livingPlan.diagnostics.${code}`;
    return {
      title: t(`${base}.title`),
      body: t(`${base}.body`),
      tips: [t(`${base}.tip1`), t(`${base}.tip2`)],
    };
  }, [impactGraph, t]);

  const startAnalysis = async () => {
    setAnalysis({ status: "starting" });
    try {
      const response = await fetch(`/api/plans/${docId}/analyze-change`, {
        method: "POST",
        headers: localeHeaders(locale),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.changeSetId) {
        await fetchPlan();
        setAnalysis({ status: "idle" });
        return;
      }
      if (!response.ok) {
        const info = aiErrorFromBody(response.status, body, response.headers);
        throw new Error(
          info.code === "AI_PROVIDER_UNAVAILABLE"
            ? t('docs.livingPlan.aiUnavailable')
            : isAiQuotaError(info)
              ? formatAiError(info, t, locale, t('docs.livingPlan.failedStart'))
              : friendlyError(body, t, t('docs.livingPlan.failedStart'))
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
    } finally {
      notifyAiQuotaChanged();
    }
  };

  if (loading) {
    return (
      <aside className="border-t border-border px-5 py-8 sm:px-6 lg:border-l lg:border-t-0 lg:px-7 xl:px-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </aside>
    );
  }

  if (loadFailed && !plan) {
    return (
      <aside
        role="alert"
        data-testid="living-plan-load-error"
        className="border-t border-border px-5 py-8 sm:px-6 lg:border-l lg:border-t-0 lg:px-7 xl:px-8"
      >
        <div className="flex items-start gap-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {t('docs.livingPlan.loadError')}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setLoading(true);
            void loadInitial();
          }}
        >
          {t('ux.retry')}
        </Button>
      </aside>
    );
  }

  return (
    <aside className="min-w-0 border-t border-border px-5 py-7 sm:px-6 lg:border-l lg:border-t-0 lg:px-7 xl:px-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-faint">
            {t('docs.livingPlan.label')}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {t('docs.livingPlan.title')}
          </h2>
        </div>
        {plan?.currentVersion && (
          <Badge variant="outline" className="border-border bg-foreground/5 font-mono text-foreground-subtle">
            v{plan.currentVersion.versionNumber}
          </Badge>
        )}
      </div>

      <div className="mt-6 border-y border-border py-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold text-foreground">
              {plan?.coverage.percentage || 0}%
            </div>
            <div className="mt-1 text-xs text-foreground-faint">{t('docs.livingPlan.coverageLabel')}</div>
          </div>
          <div className="text-right text-xs text-foreground-subtle">
            {plan?.coverage.covered || 0} / {plan?.coverage.total || 0} {t('docs.livingPlan.requirementsLinked')}
          </div>
        </div>
        <Progress value={plan?.coverage.percentage || 0} className="mt-4 h-1.5" />
      </div>

      {plan?.pendingChangeSet ? (
        <div className="mt-5 border border-amber-300/20 bg-amber-300/[0.06] p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <GitPullRequestArrow className="size-4" />
            {t('docs.livingPlan.reviewRequired')}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {localizeGeneratedCopy(plan.pendingChangeSet.summary, locale)}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-foreground-faint">
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
          <p className="mt-2 text-center text-[11px] leading-4 text-foreground-faint">
            {t('docs.livingPlan.analysisHelp')}
          </p>
          <div className="mt-1 flex justify-center">
            <AiQuotaBadge kind="workflow" />
          </div>
        </div>
      )}

      {analysis.status === "running" && (
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-foreground-subtle" data-testid="living-plan-running">
          <CircleDot className="mt-0.5 size-3.5 shrink-0 animate-pulse text-cyan-700 dark:text-cyan-300" />
          {slow ? t('feedback.analysisSlow') : t('docs.livingPlan.running')}
        </div>
      )}
      {analysis.status === "failed" && (
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {analysis.message}
        </div>
      )}

      <div className="mt-7 border-y border-border py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("livingPlan.impactGraph")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-foreground-faint">
              {t("livingPlan.showsPlanWorkPrTest")}
            </p>
          </div>
          <GitBranch className="mt-0.5 size-4 text-cyan-700 dark:text-cyan-300" />
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-y border-border">
          {[
            {
              label: t("livingPlan.issues"),
              value: impactGraph?.summary.externalIssues ?? 0,
            },
            {
              label: "PR",
              value: impactGraph?.summary.pullRequests ?? 0,
            },
            {
              label: t("livingPlan.checks"),
              value: impactGraph?.summary.checkRuns ?? 0,
            },
          ].map((item) => (
            <div key={item.label} className="px-3 py-3">
              <div className="text-lg font-semibold text-foreground">{item.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-foreground-faint">
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {impactGraph && (
          <div className="mt-4 flex flex-wrap gap-2">
            {impactGraph.integrations.length === 0 ? (
              <Badge variant="outline" className="border-border text-foreground-subtle">
                {t("livingPlan.noIntegrations")}
              </Badge>
            ) : (
              impactGraph.integrations.map((integration) => (
                <Badge
                  key={integration.id}
                  variant="outline"
                  className={cn(
                    "border-border bg-foreground/5 text-muted-foreground",
                    integration.status === "connected" && "border-emerald-300/20 text-emerald-800 dark:text-emerald-200"
                  )}
                >
                  {integration.provider}
                  <span className="ml-1 text-foreground-faint">
                    {integration.seeded
                      ? t("livingPlan.sampleData")
                      : integration.status === "connected"
                        ? t("livingPlan.connected")
                        : integration.status}
                  </span>
                </Badge>
              ))
            )}
          </div>
        )}

        {impactGraph?.summary.outdatedAgentJobs ? (
          <div className="mt-4 flex items-start gap-2 border border-amber-300/20 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {t("livingPlan.outdatedAgentJobs").replace("{n}", String(impactGraph.summary.outdatedAgentJobs))}
          </div>
        ) : null}

        {graphRequirementsWithExternalWork.length > 0 ? (
          <div className="mt-4 space-y-3">
            {graphRequirementsWithExternalWork.slice(0, 3).map((requirement) => {
              const firstIssue = requirement.externalIssues[0];
              const firstPr = requirement.pullRequests[0];
              const passingChecks = requirement.checkRuns.filter(
                (check) => check.conclusion === "success"
              ).length;
              return (
                <div key={requirement.id} className="border border-border bg-foreground/[0.03] p-3">
                  <div className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
                    {requirement.stableKey}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-foreground">
                    {localizeGeneratedCopy(requirement.title, locale)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-foreground-subtle">
                    {firstIssue && (
                      <span className="inline-flex items-center gap-1 border border-border px-2 py-1">
                        <ListChecks className="size-3" />
                        {firstIssue.key || firstIssue.provider}
                      </span>
                    )}
                    {firstPr && (
                      <a
                        href={firstPr.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:text-foreground"
                      >
                        <GitPullRequestArrow className="size-3" />
                        #{firstPr.number}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {requirement.checkRuns.length > 0 && (
                      <span className="inline-flex items-center gap-1 border border-border px-2 py-1">
                        <CheckCircle2 className="size-3 text-emerald-700 dark:text-emerald-300" />
                        {passingChecks}/{requirement.checkRuns.length}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border border-border bg-foreground/[0.02] p-4 text-xs leading-5 text-foreground-faint">
            {graphDiagnostic ? (
              <div>
                <div className="text-sm font-medium text-foreground-secondary">{graphDiagnostic.title}</div>
                <p className="mt-2">{graphDiagnostic.body}</p>
                <ul className="mt-3 space-y-1.5">
                  {graphDiagnostic.tips.map((tip) => (
                    <li key={tip} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-cyan-300/70" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              t("livingPlan.affectedIssuesPrsAndTest")
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/settings?tab=integrations">
                  {t("livingPlan.openIntegrations")}
                </Link>
              </Button>
              {impactGraph?.integrations.find((item) => item.provider === "github")?.config?.selectedRepository && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://github.com/${impactGraph.integrations.find((item) => item.provider === "github")?.config?.selectedRepository}/issues`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("livingPlan.openGithubIssues")}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">{t('docs.livingPlan.requirements')}</h3>
          <span className="text-xs text-foreground-faint">{activeRequirements.length}</span>
        </div>

        {activeRequirements.length === 0 ? (
          <div className="border-y border-border py-8 text-center">
            <p className="text-sm text-foreground-subtle">{t('docs.livingPlan.noRequirements')}</p>
            <p className="mt-1 text-xs text-foreground-faint">
              {t('docs.livingPlan.baselineHint')}
            </p>
          </div>
        ) : (
          <div className="max-h-[640px] divide-y divide-border overflow-y-auto border-y border-border">
            {activeRequirements.map((requirement) => {
              const covered = requirement.tasks.some((task) => task.isArchived === 0);
              return (
                <div key={requirement.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-xs text-cyan-700 dark:text-cyan-300">
                      {requirement.stableKey}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1 text-[10px] uppercase tracking-wide",
                        covered ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
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
                  <div className="mt-2 text-sm font-medium leading-5 text-foreground">
                    {localizeGeneratedCopy(requirement.title, locale)}
                  </div>
                  {requirement.tasks.length > 0 && (
                    <div className="mt-2 text-xs text-foreground-faint">
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
