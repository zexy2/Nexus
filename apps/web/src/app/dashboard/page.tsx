'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  FileText,
  ListTodo,
  Sparkles,
  ArrowRight,
  Plus,
  MessageSquare,
  CheckCircle2,
  ArrowUpRight,
  BrainCircuit,
  Search,
  Code,
  Kanban,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonDashboard } from '@/components/shared';
import { formatRelativeDate } from '@/lib/format';
import { cleanDocTitle } from '@/lib/text';
import { useT, useLocale } from '@/lib/i18n/provider';
import { intlLocale, type AppLocale } from '@/lib/i18n/locale';
import { useUIStore } from '@/lib/store';
import { useLocalFirstContext } from '@/lib/sync/local-first';
import { persistTaskMove, TaskMoveError } from '@/lib/sync/task-move';
import { showToast } from '@/components/shared/toast-provider';
import { friendlyError } from '@/lib/friendly-error';
import { latestExecutionBySlot } from '@/lib/run-category';
import { DemoTourCard } from '@/components/demo/demo-tour-card';

// Types
interface Document {
  id: string;
  title: string;
  iconEmoji: string | null;
  updatedAt: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
  /** Column to return to when a just-completed task is unchecked again. */
  previousStatus?: string;
}

interface Agent {
  id: string;
  name: string;
  icon: LucideIcon;
  status: 'thinking' | 'idle' | 'writing' | 'working';
  description: string;
}

interface Execution {
  id: string;
  agentType: 'supervisor' | 'researcher' | 'writer' | 'coder' | 'project_manager';
  status: string;
  input: Record<string, unknown> | null;
  createdAt: number;
}

interface TaskStats {
  total: number;
  done: number;
  inProgress: number;
}

// Format relative time — delegates to the shared, locale-aware formatter so the
// dashboard reads the same as the rest of the app in the active UI language.
function formatRelativeTime(timestamp: string | number, locale: AppLocale) {
  return formatRelativeDate(timestamp, locale);
}

// Get greeting based on time
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

// Agent card with premium styling
function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const t = useT();
  const isActive = agent.status !== 'idle';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        'group relative border-b border-border px-0 py-4 transition-colors',
        'hover:bg-foreground/[0.02]',
        isActive && 'ring-1 ring-foreground/20'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative">
          <div className={cn(
            'h-12 w-12 rounded-xl flex items-center justify-center',
            isActive ? 'bg-foreground/10' : 'bg-foreground/5'
          )}>
            <agent.icon className="h-5 w-5 text-foreground" />
          </div>
          {isActive && (
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background"
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{agent.name}</span>
            {isActive && (
              <div className="flex items-center gap-0.5 h-3">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: ['4px', '12px', '4px'] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    className="w-0.5 bg-emerald-500 rounded-full"
                  />
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{agent.description}</p>
        </div>

        {/* Status */}
        <span className={cn(
          'text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full',
          isActive ? 'text-emerald-700 dark:text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground bg-foreground/5'
        )}>
          {t(`dashboard.status${agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}`)}
        </span>
      </div>
    </motion.div>
  );
}

// Document card
function DocumentCard({ doc, index }: { doc: Document; index: number }) {
  const { locale } = useLocale();
  return (
    <Link href={`/dashboard/docs/${doc.id}`}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ x: 4 }}
        className="group flex items-center gap-4 border-b border-border py-4 transition-all duration-300 hover:bg-foreground/[0.02]"
      >
        <div className="h-10 w-10 rounded-lg bg-foreground/10 flex items-center justify-center">
          <FileText className="h-4 w-4 text-foreground-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate group-hover:text-foreground transition-colors">{cleanDocTitle(doc.title)}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(doc.updatedAt, locale)}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </motion.div>
    </Link>
  );
}

// Task item with checkbox
function TaskItem({
  task,
  index,
  pending,
  onToggle,
}: {
  task: Task;
  index: number;
  pending: boolean;
  onToggle: (task: Task) => void;
}) {
  const t = useT();
  const checked = task.status === 'done';

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-muted-foreground/50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      data-testid="dashboard-task-row"
      data-task-id={task.id}
      className={cn(
        'group flex items-center gap-3 border-b border-border py-4 transition-all duration-300',
        checked ? 'opacity-50 bg-transparent' : 'hover:bg-foreground/[0.02]'
      )}
    >
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={t('feedback.markDone').replace('{title}', task.title)}
        disabled={pending}
        whileTap={{ scale: 0.9 }}
        onClick={() => onToggle(task)}
        data-testid="dashboard-task-checkbox"
        className={cn(
          'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all disabled:opacity-60',
          checked ? 'bg-foreground border-foreground' : 'border-foreground/30 hover:border-foreground/50'
        )}
      >
        {checked && <CheckCircle2 className="h-3 w-3 text-background" />}
      </motion.button>

      <span className={cn('h-2 w-2 rounded-full shrink-0', priorityColors[task.priority])} />

      <Link
        href={`/dashboard/tasks/${task.id}`}
        className={cn(
          'flex-1 min-w-0 truncate text-sm hover:underline',
          checked && 'line-through text-muted-foreground'
        )}
      >
        {task.title}
      </Link>

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {t(`tasks.prio${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
      </span>
    </motion.div>
  );
}

// Main Dashboard Page
export default function DashboardPage() {
  const t = useT();
  const { locale } = useLocale();
  const [docs, setDocs] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskStats, setTaskStats] = useState<TaskStats>({ total: 0, done: 0, inProgress: 0 });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const { openModal } = useUIStore();
  const { engine } = useLocalFirstContext();

  // Checking a task marks it done (unchecking restores its previous column)
  // through the same single-write path as a Kanban move: queued in the sync
  // engine offline, one PATCH online.
  const toggleTask = useCallback(async (task: Task) => {
    if (pendingTaskId) return;
    const done = task.status !== 'done';
    const nextStatus = done ? 'done' : (task.previousStatus && task.previousStatus !== 'done' ? task.previousStatus : 'todo');
    setPendingTaskId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, status: nextStatus, previousStatus: done ? task.status : undefined } : item
      )
    );
    setTaskStats((stats) => ({ ...stats, done: Math.max(0, stats.done + (done ? 1 : -1)) }));
    try {
      const result = await persistTaskMove({
        engine,
        taskId: task.id,
        status: nextStatus as 'todo' | 'in_progress' | 'in_review' | 'done',
        online: typeof navigator === 'undefined' || navigator.onLine,
      });
      if (result === 'queued') showToast.info(t('tasks.toastMoveQueued'));
      else showToast.success(done ? t('feedback.taskCompleted') : t('feedback.taskReopened'));
    } catch (error) {
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
      setTaskStats((stats) => ({ ...stats, done: Math.max(0, stats.done + (done ? -1 : 1)) }));
      showToast.error(
        error instanceof TaskMoveError
          ? friendlyError(error.body, t, t('tasks.toastUpdateFailed'))
          : t('tasks.toastUpdateFailed')
      );
    } finally {
      setPendingTaskId(null);
    }
  }, [engine, pendingTaskId, t]);

  const activeAgents = agents.filter(a => a.status !== 'idle').length;
  const totalAgents = agents.length || 4;

  useEffect(() => {
    async function fetchData() {
      try {
        const [docsRes, tasksRes, executionsRes] = await Promise.all([
          fetch('/api/docs'),
          fetch('/api/tasks'),
          fetch('/api/agents/executions?limit=50'),
        ]);
        // A failed request must not render as "no plans / no tasks".
        setLoadFailed(!docsRes.ok || !tasksRes.ok || !executionsRes.ok);

        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocs(docsData.slice(0, 5));
        }

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const allTasks = Array.isArray(tasksData) ? tasksData as Task[] : [];
          setTaskStats({
            total: allTasks.length,
            done: allTasks.filter((task) => task.status === 'done').length,
            inProgress: allTasks.filter((task) => task.status === 'in_progress').length,
          });
          const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          const sortedTasks = allTasks
            .filter((t: Task) => t.status !== 'done')
            .sort((a: Task, b: Task) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2))
            .slice(0, 5);
          setTasks(sortedTasks);
        }

        if (executionsRes.ok) {
          const executions = await executionsRes.json() as Execution[];
          const agentMeta: Record<Execution['agentType'], { name: string; icon: LucideIcon }> = {
            supervisor: { name: t('dashboard.agentPlanImpact'), icon: BrainCircuit },
            researcher: { name: t('dashboard.agentResearchRun'), icon: Search },
            writer: { name: t('dashboard.agentPlanWriter'), icon: FileText },
            coder: { name: t('dashboard.agentCodeRun'), icon: Code },
            project_manager: { name: t('dashboard.agentTaskAlignment'), icon: Kanban },
          };
          // Map by product workflow (input.workflowType), not worker role:
          // plan-impact runs are stored as project_manager executions.
          const latestByAgent = latestExecutionBySlot(executions);

          const nextAgents = (Object.entries(agentMeta) as Array<[Execution['agentType'], { name: string; icon: LucideIcon }]>)
            .map(([agentType, meta]) => {
              const execution = latestByAgent.get(agentType);
              const status: Agent['status'] =
                execution?.status === 'running'
                  ? agentType === 'writer' ? 'writing' : 'working'
                  : 'idle';
              return {
                id: agentType,
                name: meta.name,
                icon: meta.icon,
                status,
                description: execution
                  ? `${execution.status === 'cancelled' ? t('runs.status.cancelled') : t(`dashboard.exec${execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}`)} • ${formatRelativeTime(execution.createdAt, locale)}`
                  : t('dashboard.noRecentExecutions'),
              };
            });

          setAgents(nextAgents);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [t, locale, reloadKey]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SkeletonDashboard />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-24 pt-10 md:px-8">
      {/* Public demo only: the guided first-run loop comes before everything else. */}
      <DemoTourCard />
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-foreground-faint">
            <CheckCircle2 className="size-4" />
            {new Date().toLocaleDateString(intlLocale(locale), { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
            {t(`dashboard.greeting${getGreeting()}`)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-subtle">
            {t('dashboard.description')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openModal('createDocument')} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('dashboard.newDocument')}
          </Button>
          <Button
            variant="outline"
            onClick={() => openModal('aiAssistant')}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {t('dashboard.askAi')}
          </Button>
        </div>
      </header>

      {loadFailed && (
        <div
          role="alert"
          data-testid="dashboard-load-error"
          className="mb-8 flex flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-2 text-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            {t('feedback.dashboardLoadFailed')}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            {t('ux.retry')}
          </Button>
        </div>
      )}

      <section className="mb-8 grid grid-cols-2 gap-px border-y border-border bg-foreground/10 lg:grid-cols-4">
        {([
          { label: t('dashboard.statTasksCompleted'), value: taskStats.done, icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: t('dashboard.statDocuments'), value: docs.length, icon: <FileText className="h-4 w-4" /> },
          { label: t('dashboard.statAiInteractions'), value: agents.filter((agent) => agent.description !== t('dashboard.noRecentExecutions')).length, icon: <MessageSquare className="h-4 w-4" /> },
          { label: t('dashboard.statActiveAgents'), value: `${activeAgents}/${totalAgents}`, icon: <ListTodo className="h-4 w-4" /> },
        ] as Array<{ label: string; value: number | string; icon: ReactNode }>).map((stat) => (
          <div key={stat.label} className="bg-background px-4 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-xs text-foreground-faint">{stat.label}</span>
              <span className="text-foreground-subtle">{stat.icon}</span>
            </div>
            <div className="text-3xl font-semibold tabular-nums text-foreground">{stat.value}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-2 xl:items-start">
        <div className="contents xl:block xl:space-y-8">
        <section className="order-1 min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-faint">
                {t('dashboard.bentoAiWorkspace')}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{t('dashboard.bentoAgentActivity')}</h2>
            </div>
            <Link href="/dashboard/agents" className="inline-flex items-center gap-2 text-sm text-foreground-subtle transition-colors hover:text-foreground">
              {t('dashboard.viewAllAgents')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="border-y border-border">
            {agents.map((agent, i) => (
              <AgentCard key={agent.id} agent={agent} index={i} />
            ))}
          </div>
        </section>

        <section className="order-3 min-w-0">
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-faint">
              {t('dashboard.bentoWorkspace')}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{t('dashboard.bentoRecentDocs')}</h2>
          </div>
          {docs.length === 0 && !loadFailed ? (
            <div className="border-y border-border py-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-foreground-faint" />
              <p className="mb-4 text-sm text-foreground-subtle">{t('dashboard.noDocuments')}</p>
              <Button size="sm" onClick={() => openModal('createDocument')}>
                {t('dashboard.createFirstDoc')}
              </Button>
            </div>
          ) : (
            <div className="border-y border-border">
              {docs.map((doc, i) => (
                <DocumentCard key={doc.id} doc={doc} index={i} />
              ))}
            </div>
          )}
        </section>
        </div>

        <div className="contents xl:block xl:space-y-8">
        <section className="order-2 min-w-0">
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-faint">
              {t('dashboard.bentoToday')}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{t('dashboard.bentoPriorityTasks')}</h2>
          </div>
          {tasks.length === 0 && !loadFailed ? (
            <div className="border-y border-border py-8 text-center">
              <ListTodo className="mx-auto mb-3 h-8 w-8 text-foreground-faint" />
              <p className="mb-4 text-sm text-foreground-subtle">{t('dashboard.noTasks')}</p>
              <Button size="sm" onClick={() => openModal('createTask')}>
                {t('dashboard.createFirstTask')}
              </Button>
            </div>
          ) : (
            <div className="border-y border-border">
              {tasks.map((task, i) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  index={i}
                  pending={pendingTaskId === task.id}
                  onToggle={toggleTask}
                />
              ))}
            </div>
          )}
        </section>

        <section className="order-4 min-w-0">
          <h2 className="mb-4 text-xl font-semibold text-foreground">{t('dashboard.bentoQuickActions')}</h2>
          <div className="grid grid-cols-2 gap-px border border-border bg-foreground/10">
            {([
              { icon: <FileText className="h-5 w-5" />, label: t('dashboard.qaPlans'), href: '/dashboard/docs' },
              { icon: <ListTodo className="h-5 w-5" />, label: t('dashboard.qaWork'), href: '/dashboard/tasks' },
              { icon: <Sparkles className="h-5 w-5" />, label: t('dashboard.qaChanges'), href: '/dashboard/changes' },
              { icon: <MessageSquare className="h-5 w-5" />, label: t('dashboard.qaAskNexus'), href: '/dashboard/chat' },
            ] as Array<{
              icon: ReactNode;
              label: string;
              action?: 'createDocument' | 'createTask' | 'settings' | 'onboarding' | 'aiAssistant';
              href?: string;
            }>).map((action) => {
              const content = (
                <>
                  <div className="h-10 w-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                    {action.icon}
                  </div>
                  <span className="text-xs font-medium">{action.label}</span>
                </>
              );

              if (action.href) {
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="flex min-h-32 flex-col items-center justify-center gap-2 bg-background p-4 transition-colors hover:bg-foreground/[0.03]"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => action.action && openModal(action.action)}
                  className="flex min-h-32 flex-col items-center justify-center gap-2 bg-background p-4 transition-colors hover:bg-foreground/[0.03]"
                >
                  {content}
                </motion.button>
              );
            })}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
