"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { DEMO_SAMPLE_EDIT_TEXT } from "@/lib/demo-scenario-content";

export type DemoTourState = {
  active: true;
  sessionKey: string;
  planDocId: string;
  planTitle: string;
  steps: { edit: boolean; analyze: boolean; apply: boolean };
  changeSetId: string | null;
  changeSetStatus: string | null;
  quota: { workflowsRemaining: number; workflowsPerDay: number };
};

/** Fired when the tour starts a plan analysis, so the Living Plan panel follows the run. */
export const LIVING_PLAN_ANALYSIS_STARTED_EVENT = "nexus:living-plan-analysis-started";
export type LivingPlanAnalysisStartedDetail = { docId: string; workflowId: string; executionId: string };

const DISMISS_KEY = "nexus-demo-tour-dismissed:";
const POLL_MS = 4000;
const SLOW_ANALYSIS_MS = 3 * 60 * 1000;

function readDismissed(sessionKey: string) {
  try {
    return window.localStorage.getItem(DISMISS_KEY + sessionKey) === "1";
  } catch {
    return false;
  }
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

type Props = {
  /** "plan" renders on the seeded plan page, with the one-click sample edit. */
  variant?: "dashboard" | "plan";
  /** Plan page only: the doc being viewed (the card hides on other docs). */
  docId?: string;
  /** Plan page only: applies the sample edit through the live editor. */
  onApplySampleEdit?: () => boolean;
  sampleEditReady?: boolean;
  /** Plan page only: true while editor content is still being saved. */
  savePending?: boolean;
};

export function DemoTourCard({
  variant = "dashboard",
  docId,
  onApplySampleEdit,
  sampleEditReady = false,
  savePending = false,
}: Props) {
  const t = useT();
  const [state, setState] = useState<DemoTourState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sampleApplied, setSampleApplied] = useState(false);
  const [analysis, setAnalysis] = useState<
    { status: "idle" } | { status: "starting" } | { status: "running"; since: number } | { status: "failed"; message: string }
  >({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/tour", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (!body?.active) {
        setState(null);
        return;
      }
      const next = body as DemoTourState;
      setState(next);
      setDismissed(readDismissed(next.sessionKey));
    } catch {
      // The tour is optional chrome; never surface its network errors.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the await.
    void refresh();
  }, [refresh]);

  const allDone = !!state && state.steps.edit && state.steps.analyze && state.steps.apply;
  const visible = !!state && !dismissed && (variant === "dashboard" || state.planDocId === docId);

  // Poll while a step can still change in the background (editor save,
  // workflow run, apply on another page). Stops once the loop is complete.
  useEffect(() => {
    if (!visible || allDone) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
        setNow(Date.now());
      }
    }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [allDone, refresh, visible]);

  if (!state || !visible) return null;

  const analysisRunning =
    !state.steps.analyze && (analysis.status === "starting" || analysis.status === "running");
  const analysisSlow = analysis.status === "running" && !state.steps.analyze && now - analysis.since > SLOW_ANALYSIS_MS;
  const quotaEmpty = state.quota.workflowsRemaining <= 0;
  const doneCount = [state.steps.edit, state.steps.analyze, state.steps.apply].filter(Boolean).length;
  const planHref = `/dashboard/docs/${state.planDocId}`;
  const reviewHref = state.changeSetId ? `/dashboard/changes?changeSet=${state.changeSetId}` : "/dashboard/changes";

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY + state.sessionKey, "1");
    } catch {
      // Private mode: dismiss for this page view only.
    }
    setDismissed(true);
  };

  const copySuggestion = async () => {
    try {
      await navigator.clipboard.writeText(DEMO_SAMPLE_EDIT_TEXT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the text stays visible to select manually.
    }
  };

  const applySample = () => {
    if (onApplySampleEdit?.()) setSampleApplied(true);
  };

  const startAnalysis = async () => {
    setAnalysis({ status: "starting" });
    try {
      const response = await fetch(`/api/plans/${state.planDocId}/analyze-change`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.changeSetId) {
        await refresh();
        setAnalysis({ status: "idle" });
        return;
      }
      if (!response.ok) {
        throw new Error(body?.message || body?.error || t("demoTour.step2Failed"));
      }
      setAnalysis({ status: "running", since: Date.now() });
      if (body?.workflowId) {
        window.dispatchEvent(
          new CustomEvent<LivingPlanAnalysisStartedDetail>(LIVING_PLAN_ANALYSIS_STARTED_EVENT, {
            detail: { docId: state.planDocId, workflowId: body.workflowId, executionId: body.executionId },
          })
        );
      }
    } catch (error) {
      setAnalysis({
        status: "failed",
        message: error instanceof Error ? error.message : t("demoTour.step2Failed"),
      });
    } finally {
      void refresh();
    }
  };

  const compact = variant === "plan";

  return (
    <section
      data-testid="demo-tour"
      aria-label={t("demoTour.title")}
      className={cn(
        "relative border border-cyan-500/25 bg-cyan-500/[0.05]",
        compact ? "mb-6 p-4" : "mb-8 p-5 md:p-6"
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("demoTour.dismiss")}
        title={t("demoTour.dismiss")}
        className="absolute right-3 top-3 rounded p-1 text-foreground-faint transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-cyan-800 dark:text-cyan-300">
          <Sparkles className="size-3.5" />
          {t("demoTour.label")}
          <span className="font-mono normal-case tracking-normal text-foreground-faint" data-testid="demo-tour-progress">
            {fill(t("demoTour.progress"), { n: doneCount })}
          </span>
        </div>
        <h2 className={cn("mt-2 font-semibold text-foreground", compact ? "text-base" : "text-xl")}>
          {allDone ? t("demoTour.doneTitle") : t("demoTour.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground-subtle">
          {allDone ? t("demoTour.doneDesc") : t("demoTour.subtitle")}
        </p>
      </div>

      {allDone ? (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/changes">
            {t("demoTour.openHistory")}
            <ArrowRight className="ml-2 size-3.5" />
          </Link>
        </Button>
      ) : (
        <ol className={cn("mt-5 grid gap-px border border-border bg-foreground/10", !compact && "lg:grid-cols-3")}>
          <Step
            index={1}
            testId="demo-tour-step-edit"
            done={state.steps.edit}
            title={t("demoTour.step1Title")}
            description={t("demoTour.step1Desc")}
            doneLabel={t("demoTour.stepDone")}
          >
            {!state.steps.edit && (
              <>
                <div className="mt-3 border border-border bg-background/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-foreground-faint">
                    {t("demoTour.suggestion")}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-foreground-secondary">{DEMO_SAMPLE_EDIT_TEXT}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {variant === "plan" ? (
                    <Button
                      size="sm"
                      onClick={applySample}
                      disabled={!sampleEditReady || sampleApplied}
                      title={sampleEditReady ? undefined : t("demoTour.sampleEditUnavailable")}
                      data-testid="demo-tour-apply-sample-edit"
                    >
                      {sampleApplied ? (
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 size-3.5" />
                      )}
                      {sampleApplied ? t("demoTour.sampleEditSaving") : t("demoTour.applySampleEdit")}
                    </Button>
                  ) : (
                    <Button asChild size="sm" data-testid="demo-tour-open-plan">
                      <Link href={planHref}>
                        {t("demoTour.openPlan")}
                        <ArrowRight className="ml-2 size-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void copySuggestion()}>
                    {copied ? <Check className="mr-2 size-3.5" /> : <Copy className="mr-2 size-3.5" />}
                    {copied ? t("demoTour.copied") : t("demoTour.copy")}
                  </Button>
                </div>
              </>
            )}
          </Step>

          <Step
            index={2}
            testId="demo-tour-step-analyze"
            done={state.steps.analyze}
            title={t("demoTour.step2Title")}
            description={t("demoTour.step2Desc")}
            doneLabel={t("demoTour.stepDone")}
          >
            {!state.steps.analyze && (
              <div className="mt-3 space-y-2">
                <Button
                  size="sm"
                  onClick={() => void startAnalysis()}
                  disabled={!state.steps.edit || analysisRunning || quotaEmpty || savePending}
                  data-testid="demo-tour-review-impact"
                >
                  {analysisRunning ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5" />
                  )}
                  {t("demoTour.step2Action")}
                </Button>
                <p className="text-[11px] leading-4 text-foreground-faint" data-testid="demo-tour-quota">
                  {quotaEmpty
                    ? t("demoTour.quotaEmpty")
                    : fill(t("demoTour.quotaUses"), {
                        remaining: state.quota.workflowsRemaining,
                        total: state.quota.workflowsPerDay,
                      })}
                </p>
                {!state.steps.edit && (
                  <p className="text-[11px] leading-4 text-foreground-faint">{t("demoTour.step2NeedsEdit")}</p>
                )}
                {analysisRunning && (
                  <p className="text-xs leading-5 text-foreground-subtle">
                    {analysisSlow ? t("demoTour.step2Slow") : t("demoTour.step2Running")}
                  </p>
                )}
                {analysis.status === "failed" && (
                  <p className="text-xs leading-5 text-red-700 dark:text-red-300">{analysis.message}</p>
                )}
              </div>
            )}
          </Step>

          <Step
            index={3}
            testId="demo-tour-step-apply"
            done={state.steps.apply}
            title={t("demoTour.step3Title")}
            description={t("demoTour.step3Desc")}
            doneLabel={t("demoTour.stepDone")}
          >
            {!state.steps.apply && (
              <div className="mt-3">
                {state.steps.analyze && state.changeSetId ? (
                  <Button asChild size="sm">
                    <Link href={reviewHref}>
                      {t("demoTour.step3Action")}
                      <ArrowRight className="ml-2 size-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <p className="text-[11px] leading-4 text-foreground-faint">{t("demoTour.step3Waiting")}</p>
                )}
              </div>
            )}
          </Step>
        </ol>
      )}
    </section>
  );
}

function Step({
  index,
  testId,
  done,
  title,
  description,
  doneLabel,
  children,
}: {
  index: number;
  testId: string;
  done: boolean;
  title: string;
  description: string;
  doneLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <li data-testid={testId} data-state={done ? "done" : "todo"} className="bg-background px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
            done
              ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
              : "border-foreground/25 text-foreground-subtle"
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-sm font-medium", done ? "text-foreground-subtle" : "text-foreground")}>
              {title}
            </span>
            {done && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {doneLabel}
              </span>
            )}
          </div>
          {!done && <p className="mt-1 text-xs leading-5 text-foreground-subtle">{description}</p>}
          {children}
        </div>
      </div>
    </li>
  );
}
