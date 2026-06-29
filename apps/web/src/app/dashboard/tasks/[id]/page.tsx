"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/shared/toast-provider";
import { useT, useLocale } from "@/lib/i18n/provider";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type Task = {
  id: string;
  workspaceId: string;
  docId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeAgentType: string | null;
  dueDate: number | null;
  alignmentStatus: "aligned" | "needs_review" | "orphaned" | string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  agentJob: { id: string; status: string } | null;
  agentHandoffWritable: boolean;
};

type AgentJobDetail = {
  id: string;
  status: string;
  contextVersion: number;
  claimedByClient: string | null;
  events: Array<{ id: string; type: string; message: string | null; createdAt: string }>;
  submissions: Array<{
    id: string;
    pullRequestUrl: string;
    commitSha: string;
    summary: string;
    tests: Array<{ command: string; status: string }>;
    acceptanceEvidence: Array<{ requirementKey: string; criterion: string; evidence: string }>;
    reviewStatus: string;
  }>;
};

const statusIcon = {
  todo: Circle,
  in_progress: Clock,
  in_review: GitPullRequest,
  done: CheckCircle2,
} satisfies Record<TaskStatus, typeof Circle>;

const priorityTone = {
  low: "border-white/10 bg-white/5 text-white/55",
  medium: "border-blue-400/25 bg-blue-400/10 text-blue-200",
  high: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  urgent: "border-red-400/25 bg-red-400/10 text-red-200",
} satisfies Record<TaskPriority, string>;

const alignmentTone: Record<string, string> = {
  aligned: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  needs_review: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  orphaned: "border-white/10 bg-white/5 text-white/50",
};

function toDateInput(value: number | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const t = useT();
  const { locale } = useLocale();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agentJob, setAgentJob] = useState<AgentJobDetail | null>(null);
  const [agentAction, setAgentAction] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    async function fetchTask() {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
        if (!response.ok) {
          router.push("/dashboard/tasks");
          return;
        }

        const data = await response.json() as Task;
        setTask(data);
        setTitle(data.title);
        setDescription(data.description || "");
        setStatus(data.status);
        setPriority(data.priority);
        setDueDate(toDateInput(data.dueDate));
      } catch {
        router.push("/dashboard/tasks");
      } finally {
        setLoading(false);
      }
    }

    if (taskId) void fetchTask();
  }, [router, taskId]);

  useEffect(() => {
    if (!task?.agentJob?.id) {
      setAgentJob(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/agent-jobs/${task.agentJob.id}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled) setAgentJob(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [task?.agentJob?.id]);

  const hasChanges = useMemo(() => {
    if (!task) return false;
    return (
      title.trim() !== task.title ||
      description !== (task.description || "") ||
      status !== task.status ||
      priority !== task.priority ||
      dueDate !== toDateInput(task.dueDate)
    );
  }, [description, dueDate, priority, status, task, title]);

  const statusLabel = (value: TaskStatus) => {
    if (value === "todo") return t("tasks.colTodo");
    if (value === "in_progress") return t("tasks.colInProgress");
    if (value === "in_review") return t("tasks.colInReview");
    return t("tasks.colDone");
  };

  const refreshTaskAndJob = async () => {
    const taskResponse = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
    if (!taskResponse.ok) return;
    const nextTask = await taskResponse.json() as Task;
    setTask(nextTask);
    setStatus(nextTask.status);
    if (nextTask.agentJob?.id) {
      const jobResponse = await fetch(`/api/agent-jobs/${nextTask.agentJob.id}`, { cache: "no-store" });
      if (jobResponse.ok) setAgentJob(await jobResponse.json());
    } else {
      setAgentJob(null);
    }
  };

  const runAgentAction = async (url: string, body?: Record<string, unknown>) => {
    if (agentAction) return;
    setAgentAction(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || result?.error || t("taskDetail.agentActionFailed"));
      await refreshTaskAndJob();
      showToast.success(t("taskDetail.agentActionComplete"));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t("taskDetail.agentActionFailed"));
    } finally {
      setAgentAction(false);
    }
  };

  const priorityLabel = (value: TaskPriority) => {
    if (value === "low") return t("tasks.prioLow");
    if (value === "medium") return t("tasks.prioMedium");
    if (value === "high") return t("tasks.prioHigh");
    return t("tasks.prioUrgent");
  };

  const alignmentLabel = (value: string) => {
    if (value === "aligned") return t("tasks.alignmentAligned");
    if (value === "needs_review") return t("tasks.alignmentNeedsReview");
    if (value === "orphaned") return t("tasks.alignmentOrphaned");
    return value;
  };

  const handleSave = async () => {
    if (!task || !hasChanges || saving) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      showToast.error(t("taskDetail.titleRequired"));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          description,
          status,
          priority,
          dueDate: dueDate || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || t("taskDetail.saveFailed"));
      }

      const updated = body as Task;
      setTask({
        ...task,
        ...updated,
        createdAt: task.createdAt,
        dueDate: updated.dueDate ?? null,
      });
      setTitle(updated.title);
      setDescription(updated.description || "");
      setStatus(updated.status);
      setPriority(updated.priority);
      setDueDate(toDateInput(updated.dueDate ?? null));
      showToast.success(t("taskDetail.saved"));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t("taskDetail.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.error || t("taskDetail.archiveFailed"));
      }
      showToast.success(t("taskDetail.archived"));
      router.push("/dashboard/tasks");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t("taskDetail.archiveFailed"));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) return null;

  const StatusIcon = statusIcon[status];

  return (
    <div className="mx-auto min-h-screen max-w-[1440px] px-4 pb-24 pt-8 md:px-8">
      <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="rounded-full">
              <Link href="/dashboard/tasks">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Badge variant="outline" className={cn("gap-2", priorityTone[priority])}>
              <span className="size-1.5 rounded-full bg-current" />
              {priorityLabel(priority)}
            </Badge>
            <Badge variant="outline" className="gap-2 border-white/10 bg-white/5 text-white/60">
              <StatusIcon className="size-3.5" />
              {statusLabel(status)}
            </Badge>
          </div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-white/35">
            {t("taskDetail.label")}
          </p>
          <h1 className="max-w-4xl truncate text-3xl font-semibold text-white md:text-4xl">
            {task.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
            {t("taskDetail.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {task.docId && (
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/dashboard/docs/${task.docId}`}>
                <FileText className="size-4" />
                {t("taskDetail.openPlan")}
              </Link>
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t("taskDetail.save")}
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-6">
          <section className="border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/35">
              {t("taskDetail.title")}
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-auto border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
              placeholder={t("taskDetail.titlePlaceholder")}
            />
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <label className="mb-3 block text-xs font-medium uppercase tracking-[0.16em] text-white/35">
              {t("taskDetail.taskDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[260px] resize-y border-white/10 bg-black/20 text-base leading-7"
              placeholder={t("taskDetail.descriptionPlaceholder")}
            />
          </section>
        </main>

        <aside className="space-y-5">
          <section className="border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/35">{t("taskDetail.agentHandoff")}</p>
                <h2 className="mt-1 text-sm font-semibold text-white">
                  {agentJob ? t("taskDetail.agentRun") : t("taskDetail.agentReady")}
                </h2>
              </div>
              <Bot className="size-4 text-white/50" />
            </div>

            {!agentJob ? (
              <>
                <p className="text-xs leading-5 text-white/45">{t("taskDetail.agentReadyDesc")}</p>
                <Button className="mt-4 w-full gap-2" disabled={agentAction || !task.agentHandoffWritable} onClick={() => runAgentAction(`/api/tasks/${taskId}/agent-jobs`)}>
                  {agentAction ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                  {t("taskDetail.sendToAgent")}
                </Button>
                {!task.agentHandoffWritable && <p className="mt-2 text-xs text-amber-200/70">{t("taskDetail.demoAgentReadOnly")}</p>}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-y border-white/10 py-3 text-xs">
                  <span className="text-white/40">{t("taskDetail.agentStatus")}</span>
                  <span className={cn(
                    "font-medium uppercase",
                    agentJob.status === "outdated" ? "text-amber-300" :
                      agentJob.status === "submitted" ? "text-blue-300" :
                        agentJob.status === "approved" ? "text-emerald-300" : "text-white/70"
                  )}>{t(`taskDetail.agentStatuses.${agentJob.status}`)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-white/45">
                  <span>{t("taskDetail.contextVersion")}</span>
                  <span className="text-right text-white/70">v{agentJob.contextVersion}</span>
                  <span>{t("taskDetail.agentClient")}</span>
                  <span className="text-right text-white/70">{agentJob.claimedByClient || t("taskDetail.notClaimed")}</span>
                </div>

                {agentJob.submissions[0] && (
                  <div className="border border-white/10 bg-black/20 p-3">
                    <p className="line-clamp-3 text-xs leading-5 text-white/55">{agentJob.submissions[0].summary}</p>
                    <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-2">
                      <a href={agentJob.submissions[0].pullRequestUrl} target="_blank" rel="noreferrer">
                        <GitPullRequest className="size-3.5" />
                        {t("taskDetail.openPullRequest")}
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>
                )}

                {agentJob.status === "submitted" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" disabled={agentAction} onClick={() => runAgentAction(`/api/agent-jobs/${agentJob.id}/review`, { decision: "approve" })}>{t("taskDetail.approveResult")}</Button>
                    <Button size="sm" variant="outline" disabled={agentAction} onClick={() => runAgentAction(`/api/agent-jobs/${agentJob.id}/review`, { decision: "reject" })}>{t("taskDetail.rejectResult")}</Button>
                  </div>
                )}
                {agentJob.status === "outdated" && (
                  <Button size="sm" className="w-full gap-2" disabled={agentAction} onClick={() => runAgentAction(`/api/agent-jobs/${agentJob.id}/refresh-context`)}>
                    <RefreshCw className="size-3.5" />
                    {t("taskDetail.refreshAgentContext")}
                  </Button>
                )}
                {["queued", "claimed", "running", "outdated"].includes(agentJob.status) && (
                  <Button size="sm" variant="ghost" className="w-full gap-2 text-white/45" disabled={agentAction} onClick={() => runAgentAction(`/api/agent-jobs/${agentJob.id}/cancel`)}>
                    <XCircle className="size-3.5" />
                    {t("taskDetail.cancelAgentJob")}
                  </Button>
                )}
                {["rejected", "failed", "cancelled"].includes(agentJob.status) && (
                  <Button className="w-full gap-2" size="sm" disabled={agentAction} onClick={() => runAgentAction(`/api/tasks/${taskId}/agent-jobs`)}>
                    <Bot className="size-3.5" />
                    {t("taskDetail.sendToAgentAgain")}
                  </Button>
                )}

                {agentJob.events.length > 0 && (
                  <div className="border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs text-white/35">{t("taskDetail.latestAgentEvent")}</p>
                    <p className="text-xs leading-5 text-white/55">{agentJob.events[0].message || agentJob.events[0].type}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-5 text-sm font-semibold text-white">{t("taskDetail.properties")}</h2>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs text-white/40">{t("taskDetail.status")}</label>
                <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                  <SelectTrigger className="border-white/10 bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">{t("tasks.colTodo")}</SelectItem>
                    <SelectItem value="in_progress">{t("tasks.colInProgress")}</SelectItem>
                    <SelectItem value="in_review">{t("tasks.colInReview")}</SelectItem>
                    <SelectItem value="done">{t("tasks.colDone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-xs text-white/40">{t("taskDetail.priority")}</label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                  <SelectTrigger className="border-white/10 bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("tasks.prioLow")}</SelectItem>
                    <SelectItem value="medium">{t("tasks.prioMedium")}</SelectItem>
                    <SelectItem value="high">{t("tasks.prioHigh")}</SelectItem>
                    <SelectItem value="urgent">{t("tasks.prioUrgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-xs text-white/40">{t("taskDetail.dueDate")}</label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="border-white/10 bg-black/20 pl-10"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-5">
                <div className="mb-2 text-xs text-white/40">{t("taskDetail.alignment")}</div>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-2",
                    alignmentTone[task.alignmentStatus] || "border-white/10 bg-white/5 text-white/50"
                  )}
                >
                  {task.alignmentStatus === "needs_review" && <AlertTriangle className="size-3.5" />}
                  {alignmentLabel(task.alignmentStatus)}
                </Badge>
              </div>
            </div>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">{t("taskDetail.trace")}</h2>
            <div className="space-y-3 text-sm text-white/55">
              <div className="flex justify-between gap-4">
                <span>{t("taskDetail.created")}</span>
                <span>{formatRelativeDate(task.createdAt, locale)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>{t("taskDetail.updated")}</span>
                <span>{formatRelativeDate(task.updatedAt, locale)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>{t("taskDetail.sourcePlan")}</span>
                <span>{task.docId ? t("taskDetail.linked") : t("tasks.alignmentOrphaned")}</span>
              </div>
            </div>
          </section>

          <section className="border border-red-400/15 bg-red-400/[0.03] p-5">
            <h2 className="text-sm font-semibold text-red-100">{t("taskDetail.archiveTitle")}</h2>
            <p className="mt-2 text-xs leading-5 text-red-100/55">
              {t("taskDetail.archiveDesc")}
            </p>
            <Button
              variant="destructive"
              className="mt-4 w-full gap-2"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {t("taskDetail.archive")}
            </Button>
          </section>
        </aside>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskDetail.archiveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("taskDetail.archiveConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("taskDetail.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
