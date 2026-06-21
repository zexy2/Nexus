"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileText,
  GitPullRequestArrow,
  Kanban,
  Loader2,
  Play,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/shared/toast-provider";
import { useT, useLocale } from "@/lib/i18n/provider";
import { formatRelativeDate } from "@/lib/format";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";

type Run = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  agentType: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  temporalWorkflowId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type DocumentOption = {
  id: string;
  title: string;
};

type CodingAgentJob = {
  id: string;
  status: string;
  contextVersion: number;
  claimedByClient: string | null;
  createdAt: string;
  task: { id: string; title: string } | null;
};

type LaunchMode = "plan" | "research" | "impact" | null;

const runStatus = {
  running: {
    icon: CircleDot,
    labelKey: "agents.center.statusRunning",
    className: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  },
  pending: {
    icon: CircleDot,
    labelKey: "agents.center.statusPending",
    className: "border-white/10 bg-white/5 text-white/50",
  },
  completed: {
    icon: CheckCircle2,
    labelKey: "agents.center.statusCompleted",
    className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  },
  failed: {
    icon: XCircle,
    labelKey: "agents.center.statusFailed",
    className: "border-red-400/25 bg-red-400/10 text-red-200",
  },
};

function getRunName(run: Run, t: (path: string) => string) {
  const type = run.input?.workflowType;
  if (type === "plan_impact") return t("agents.center.runPlanImpact");
  if (type === "document") return t("agents.center.runPlanGeneration");
  if (type === "research") return t("agents.center.runResearch");
  if (type === "tasks") return t("agents.center.runTaskBreakdown");
  if (type === "code") return t("agents.center.runCodeGeneration");
  return run.agentType.replaceAll("_", " ");
}

function getRunSteps(run: Run) {
  if (!run.output || typeof run.output !== "object") return [];
  const output = run.output as Record<string, unknown>;
  if (Array.isArray(output.steps)) return output.steps as Array<Record<string, unknown>>;
  return [];
}

export default function WorkflowCenterPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [codingJobs, setCodingJobs] = useState<CodingAgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const displayDocTitle = useCallback((value: string) => {
    return localizeGeneratedCopy(
      value === "Generated Document" ? t("docs.detail.generatedTitle") : value,
      locale
    );
  }, [locale, t]);

  const fetchRuns = useCallback(async () => {
    const response = await fetch("/api/workflows?limit=40", { cache: "no-store" });
    if (!response.ok) throw new Error(t("agents.center.loadError"));
    setRuns(await response.json());
  }, [t]);

  const fetchDocuments = useCallback(async () => {
    const response = await fetch("/api/docs", { cache: "no-store" });
    if (!response.ok) return;
    setDocuments(await response.json());
  }, []);

  const fetchCodingJobs = useCallback(async () => {
    const response = await fetch("/api/agent-jobs", { cache: "no-store" });
    if (response.ok) setCodingJobs(await response.json());
  }, []);

  useEffect(() => {
    void Promise.all([fetchRuns(), fetchDocuments(), fetchCodingJobs()])
      .catch((error) =>
        showToast.error(error instanceof Error ? error.message : t("agents.center.centerLoadError"))
      )
      .finally(() => setLoading(false));
  }, [fetchCodingJobs, fetchDocuments, fetchRuns, t]);

  const hasRunning = runs.some((run) => run.status === "running" || run.status === "pending") ||
    codingJobs.some((job) => ["queued", "claimed", "running", "submitted"].includes(job.status));
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => void Promise.all([fetchRuns(), fetchCodingJobs()]), 5000);
    return () => window.clearInterval(timer);
  }, [fetchCodingJobs, fetchRuns, hasRunning]);

  const metrics = useMemo(() => ({
    running: runs.filter((run) => run.status === "running" || run.status === "pending").length,
    completed: runs.filter((run) => run.status === "completed").length,
    failed: runs.filter((run) => run.status === "failed").length,
  }), [runs]);

  const closeDialog = () => {
    setLaunchMode(null);
    setTitle("");
    setPrompt("");
    setSelectedDocId("");
  };

  const launchWorkflow = async () => {
    if (!launchMode) return;
    setSubmitting(true);
    try {
      let response: Response;
      if (launchMode === "impact") {
        if (!selectedDocId) throw new Error(t("agents.center.choosePlanError"));
        response = await fetch(`/api/plans/${selectedDocId}/analyze-change`, {
          method: "POST",
        });
      } else {
        if (!prompt.trim()) throw new Error(t("agents.center.describeOutcomeError"));
        response = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowType: launchMode === "plan" ? "document" : "research",
            input: launchMode === "plan"
              ? {
                  title: title.trim() || t("agents.center.defaultPlanTitle"),
                  prompt: prompt.trim(),
                  style: "technical",
                }
              : {
                  query: prompt.trim(),
                  depth: "deep",
                  sources: ["documents", "web"],
                },
          }),
        });
      }

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409 && body?.changeSetId) {
          router.push(`/dashboard/changes?changeSet=${body.changeSetId}`);
          closeDialog();
          return;
        }
        throw new Error(body?.message || body?.error || t("agents.center.workflowStartError"));
      }

      showToast.success(t("agents.center.workflowStarted"));
      closeDialog();
      await fetchRuns();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t("agents.center.workflowStartError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-[1450px] px-4 pb-24 pt-10 md:px-8">
      <header className="mb-10 flex flex-col justify-between gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            <Activity className="size-4" />
            {t("agents.center.label")}
          </div>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{t("agents.center.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {t("agents.center.description")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-white/10">
          {[
            [t("agents.center.metricRunning"), metrics.running],
            [t("agents.center.metricCompleted"), metrics.completed],
            [t("agents.center.metricFailed"), metrics.failed],
          ].map(([label, value]) => (
            <div key={String(label)} className="min-w-24 bg-background px-4 py-3 text-center">
              <div className="text-xl font-semibold text-white">{value}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-white/35">{label}</div>
            </div>
          ))}
        </div>
      </header>

      <section className="mb-12">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white">{t("agents.center.startTitle")}</h2>
          <p className="mt-1 text-xs text-white/40">
            {t("agents.center.startDesc")}
          </p>
        </div>
        <div className="grid border-y border-white/10 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: t("agents.center.outcomePlanTitle"),
              description: t("agents.center.outcomePlanDesc"),
              icon: FileText,
              action: () => setLaunchMode("plan"),
            },
            {
              title: t("agents.center.outcomeImpactTitle"),
              description: t("agents.center.outcomeImpactDesc"),
              icon: GitPullRequestArrow,
              action: () => setLaunchMode("impact"),
            },
            {
              title: t("agents.center.outcomeWorkTitle"),
              description: t("agents.center.outcomeWorkDesc"),
              icon: Kanban,
              action: () => router.push("/dashboard/changes"),
            },
            {
              title: t("agents.center.outcomeResearchTitle"),
              description: t("agents.center.outcomeResearchDesc"),
              icon: Search,
              action: () => setLaunchMode("research"),
            },
          ].map((item, index) => (
            <button
              key={item.title}
              onClick={item.action}
              className={cn(
                "group min-h-52 px-6 py-7 text-left transition-colors hover:bg-white/[0.04]",
                index > 0 && "border-t border-white/10 md:border-l md:border-t-0",
                index === 2 && "md:border-t xl:border-t-0"
              )}
            >
              <item.icon className="size-5 text-white/55 transition-colors group-hover:text-white" />
              <h3 className="mt-8 text-lg font-medium text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-5 text-white/42">{item.description}</p>
              <div className="mt-6 flex items-center gap-2 text-xs text-white/45 group-hover:text-white">
                {t("agents.center.start")}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Coding Agent Runs</h2>
            <p className="mt-1 text-xs text-white/40">
              {locale === "tr"
                ? "Yerel Codex, Claude Code ve Cursor istemcilerine teslim edilen sürümlenmiş işler."
                : "Versioned work handed to local Codex, Claude Code, and Cursor clients."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchCodingJobs()}>{t("common.refresh")}</Button>
        </div>
        {codingJobs.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center border-y border-white/10 text-sm text-white/35">
            {locale === "tr" ? "Henüz coding agent çalışması yok." : "No coding-agent runs yet."}
          </div>
        ) : (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {codingJobs.map((job) => (
              <Link key={job.id} href={`/dashboard/tasks/${job.task?.id || ""}`} className="grid gap-3 py-4 transition-colors hover:bg-white/[0.02] md:grid-cols-[140px_minmax(0,1fr)_180px]">
                <div>
                  <Badge variant="outline" className={cn(
                    "uppercase",
                    job.status === "outdated" ? "border-amber-400/25 text-amber-200" :
                      job.status === "submitted" ? "border-blue-400/25 text-blue-200" :
                        job.status === "approved" ? "border-emerald-400/25 text-emerald-200" : "border-white/10 text-white/55"
                  )}>{job.status}</Badge>
                </div>
                <div>
                  <p className="font-medium text-white">{job.task?.title || job.id}</p>
                  <p className="mt-1 text-xs text-white/35">Context v{job.contextVersion} · {job.claimedByClient || (locale === "tr" ? "agent bekleniyor" : "waiting for agent")}</p>
                </div>
                <div className="text-xs text-white/35 md:text-right">{formatRelativeDate(job.createdAt, locale)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">{t("agents.center.runsTitle")}</h2>
            <p className="mt-1 text-xs text-white/40">
              {t("agents.center.runsDesc")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRuns()}>
            {t("common.refresh")}
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center border-y border-white/10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center border-y border-white/10 text-center">
            <Sparkles className="size-7 text-white/30" />
            <p className="mt-3 text-sm text-white/50">{t("agents.center.noRuns")}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {runs.map((run) => {
              const config = runStatus[run.status] || runStatus.pending;
              const StatusIcon = config.icon;
              const steps = getRunSteps(run);
              return (
                <div
                  key={run.id}
                  className="grid gap-4 py-5 md:grid-cols-[180px_minmax(0,1fr)_180px]"
                >
                  <div>
                    <Badge variant="outline" className={config.className}>
                      <StatusIcon
                        className={cn("mr-1.5 size-3", run.status === "running" && "animate-pulse")}
                      />
                      {t(config.labelKey)}
                    </Badge>
                    <div className="mt-2 font-mono text-[11px] text-white/30">
                      {(run.temporalWorkflowId || run.id).slice(0, 24)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium capitalize text-white">{getRunName(run, t)}</div>
                    {run.errorMessage ? (
                      <p className="mt-1 text-sm text-red-300">{run.errorMessage}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {steps.length > 0 ? (
                          steps.map((step, index) => (
                            <span
                              key={`${run.id}-${index}`}
                              className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/45"
                            >
                              {typeof step.agentName === "string"
                                ? step.agentName.replaceAll("_", " ")
                                : `${t("agents.center.step")} ${index + 1}`}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-white/35">
                            {run.status === "running"
                              ? t("agents.center.workflowRunning")
                              : t("agents.center.noStepMetadata")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-left text-xs text-white/35 md:text-right">
                    <div>{formatRelativeDate(run.startedAt || run.createdAt, locale)}</div>
                    {run.input?.workflowType === "plan_impact" && (
                      <Link
                        href="/dashboard/changes"
                        className="mt-2 inline-flex items-center gap-1 text-white/55 hover:text-white"
                      >
                        {t("agents.center.openReview")}
                        <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={launchMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {launchMode === "plan"
                ? t("agents.center.dialogPlanTitle")
                : launchMode === "research"
                  ? t("agents.center.dialogResearchTitle")
                  : t("agents.center.dialogImpactTitle")}
            </DialogTitle>
            <DialogDescription>
              {launchMode === "impact"
                ? t("agents.center.dialogImpactDesc")
                : t("agents.center.dialogOutcomeDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {launchMode === "impact" ? (
              <div>
                <Label>{t("agents.center.planLabel")}</Label>
                <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={t("agents.center.choosePlan")} />
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((document) => (
                      <SelectItem key={document.id} value={document.id}>
                        {displayDocTitle(document.title)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                {launchMode === "plan" && (
                  <div>
                    <Label htmlFor="workflow-title">{t("agents.center.planTitleLabel")}</Label>
                    <Input
                      id="workflow-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2"
                      placeholder={t("agents.center.planTitlePlaceholder")}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="workflow-prompt">
                    {launchMode === "research" ? t("agents.center.researchQuestion") : t("agents.center.projectIdea")}
                  </Label>
                  <Textarea
                    id="workflow-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="mt-2 min-h-32"
                    placeholder={
                      launchMode === "research"
                        ? t("agents.center.researchPlaceholder")
                        : t("agents.center.planPlaceholder")
                    }
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {t("agents.center.cancel")}
            </Button>
            <Button onClick={() => void launchWorkflow()} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              {t("agents.center.startWorkflow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
