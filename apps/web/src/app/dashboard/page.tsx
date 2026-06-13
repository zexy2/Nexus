'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import CountUp from 'react-countup';
import {
  FileText,
  ListTodo,
  Bot,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Plus,
  MessageSquare,
  CheckCircle2,
  ArrowUpRight,
  BrainCircuit,
  Search,
  Code,
  Kanban,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonDashboard } from '@/components/shared';
import { formatRelativeDate } from '@/lib/format';
import { cleanDocTitle } from '@/lib/text';
import { useUIStore } from '@/lib/store';
import {
  BentoGrid,
  BentoCard,
  ScrollReveal,
  HoverTilt,
  MagneticButton,
} from '@/components/animations';

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

// Format relative time — delegates to the shared, locale-aware formatter so the
// dashboard reads the same as the rest of the app (no more English "6d ago"
// mixed into a Turkish UI).
function formatRelativeTime(timestamp: string | number) {
  return formatRelativeDate(timestamp, 'tr');
}

// Get greeting based on time
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Animated number component
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <span className="tabular-nums">
      <CountUp end={value} duration={2.5} />
      {suffix}
    </span>
  );
}

// Agent card with premium styling
function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const isActive = agent.status !== 'idle';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        'group relative p-5 rounded-2xl transition-all duration-500',
        'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20',
        isActive && 'ring-1 ring-white/20'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative">
          <div className={cn(
            'h-12 w-12 rounded-xl flex items-center justify-center',
            isActive ? 'bg-white/10' : 'bg-white/5'
          )}>
            <agent.icon className="h-5 w-5 text-white/80" />
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
          isActive ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground bg-white/5'
        )}>
          {agent.status}
        </span>
      </div>
    </motion.div>
  );
}

// Document card
function DocumentCard({ doc, index }: { doc: Document; index: number }) {
  return (
    <Link href={`/dashboard/docs/${doc.id}`}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ x: 4 }}
        className="group flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-300"
      >
        <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-lg">
          {doc.iconEmoji || '📄'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate group-hover:text-white transition-colors">{cleanDocTitle(doc.title)}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(doc.updatedAt)}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </motion.div>
    </Link>
  );
}

// Task item with checkbox
function TaskItem({ task, index, onToggle }: { task: Task; index: number; onToggle: () => void }) {
  const [checked, setChecked] = useState(false);

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
      className={cn(
        'group flex items-center gap-3 p-4 rounded-xl transition-all duration-300',
        checked ? 'opacity-50 bg-transparent' : 'bg-white/5 hover:bg-white/10'
      )}
    >
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => { setChecked(!checked); onToggle(); }}
        className={cn(
          'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
          checked ? 'bg-white border-white' : 'border-white/30 hover:border-white/50'
        )}
      >
        {checked && <CheckCircle2 className="h-3 w-3 text-background" />}
      </motion.button>

      <span className={cn('h-2 w-2 rounded-full shrink-0', priorityColors[task.priority])} />

      <span className={cn('flex-1 text-sm', checked && 'line-through text-muted-foreground')}>
        {task.title}
      </span>

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {task.priority}
      </span>
    </motion.div>
  );
}

// Main Dashboard Page
export default function DashboardPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { openModal } = useUIStore();

  const activeAgents = agents.filter(a => a.status !== 'idle').length;
  const totalAgents = agents.length || 4;

  useEffect(() => {
    async function fetchData() {
      try {
        const [docsRes, tasksRes, executionsRes] = await Promise.all([
          fetch('/api/docs'),
          fetch('/api/tasks'),
          fetch('/api/agents/executions?limit=20'),
        ]);

        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocs(docsData.slice(0, 5));
        }

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          const sortedTasks = tasksData
            .filter((t: Task) => t.status !== 'done')
            .sort((a: Task, b: Task) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2))
            .slice(0, 5);
          setTasks(sortedTasks);
        }

        if (executionsRes.ok) {
          const executions = await executionsRes.json() as Execution[];
          const agentMeta: Record<Execution['agentType'], { name: string; icon: LucideIcon }> = {
            supervisor: { name: 'Supervisor', icon: BrainCircuit },
            researcher: { name: 'Researcher', icon: Search },
            writer: { name: 'Writer', icon: FileText },
            coder: { name: 'Coder', icon: Code },
            project_manager: { name: 'Task Manager', icon: Kanban },
          };
          const latestByAgent = new Map<Execution['agentType'], Execution>();

          for (const execution of executions) {
            if (!latestByAgent.has(execution.agentType)) {
              latestByAgent.set(execution.agentType, execution);
            }
          }

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
                  ? `${execution.status} • ${formatRelativeTime(execution.createdAt)}`
                  : 'No recent executions',
              };
            });

          setAgents(nextAgents);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SkeletonDashboard />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-32">
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center justify-center px-6 pt-16 pb-24">
        {/* Background gradient */}
        <div className="absolute inset-0 dashboard-hero-gradient pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-label text-muted-foreground mb-4 block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-display-lg font-bold tracking-tightest mb-6"
          >
            {getGreeting()}
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-body-lg text-muted-foreground max-w-2xl mx-auto mb-8"
          >
            {activeAgents} of {totalAgents} agents are working. Your workspace is ready for AI workflows.
          </motion.p>

          {/* Quick actions */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex items-center justify-center gap-4 flex-wrap"
          >
            <MagneticButton>
              <Button
                size="lg"
                onClick={() => openModal('createDocument')}
                className="rounded-full px-8 gap-2"
              >
                <Plus className="h-4 w-4" />
                New Document
              </Button>
            </MagneticButton>

            <MagneticButton>
              <Button
                variant="outline"
                size="lg"
                onClick={() => openModal('aiAssistant')}
                className="rounded-full px-8 gap-2 glass-premium border-white/20"
              >
                <Sparkles className="h-4 w-4" />
                Ask AI
              </Button>
            </MagneticButton>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex flex-col items-center gap-2 text-muted-foreground"
          >
            <span className="text-[10px] uppercase tracking-widest">Scroll</span>
            <div className="h-8 w-[1px] bg-gradient-to-b from-muted-foreground to-transparent" />
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <ScrollReveal>
        <section className="px-6 md:px-12 lg:px-24 mb-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {/* Stats Cards */}
            {([
              { label: 'Tasks Completed', value: tasks.filter((task) => task.status === 'done').length, icon: <CheckCircle2 className="h-5 w-5" /> },
              { label: 'Documents', value: docs.length, icon: <FileText className="h-5 w-5" /> },
              { label: 'AI Interactions', value: agents.filter((agent) => agent.description !== 'No recent executions').length, icon: <MessageSquare className="h-5 w-5" /> },
              { label: 'Active Agents', value: activeAgents, suffix: `/${totalAgents}`, icon: <Bot className="h-5 w-5" /> },
            ] as Array<{ label: string; value: number; trend?: string; suffix?: string; icon: ReactNode }>).map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <HoverTilt tiltAmount={5}>
                  <div className="relative p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors overflow-hidden group">
                    {/* Background glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-caption text-muted-foreground">{stat.label}</span>
                        <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                          {stat.icon}
                        </div>
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl md:text-5xl font-bold tracking-tighter">
                          <AnimatedNumber value={stat.value} />
                        </span>
                        {stat.suffix && (
                          <span className="text-xl text-muted-foreground">{stat.suffix}</span>
                        )}
                      </div>

                      {stat.trend && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-500">{stat.trend}</span>
                          <span className="text-xs text-muted-foreground">this week</span>
                        </div>
                      )}
                    </div>
                  </div>
                </HoverTilt>
              </motion.div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* Bento Grid Section */}
      <section className="px-6 md:px-12 lg:px-24 mb-16">
        <BentoGrid columns={3} gap="md">
          {/* Agent Activity - Takes 2 rows */}
          <BentoCard
            title="Agent Activity"
            subtitle="AI WORKSPACE"
            colSpan={1}
            rowSpan={2}
            className="min-h-[500px]"
            interactive={false}
          >
            <div className="space-y-3 mt-4">
              {agents.map((agent, i) => (
                <AgentCard key={agent.id} agent={agent} index={i} />
              ))}
            </div>
            <Link href="/dashboard/agents" className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              View all agents
              <ArrowRight className="h-4 w-4" />
            </Link>
          </BentoCard>

          {/* Recent Documents */}
          <BentoCard
            title="Recent Documents"
            subtitle="WORKSPACE"
            colSpan={2}
            className="min-h-[280px]"
            interactive={false}
          >
            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground mb-4">No documents yet</p>
                <Button size="sm" onClick={() => openModal('createDocument')}>
                  Create your first doc
                </Button>
              </div>
            ) : (
              <div className="space-y-2 mt-4">
                {docs.map((doc, i) => (
                  <DocumentCard key={doc.id} doc={doc} index={i} />
                ))}
              </div>
            )}
          </BentoCard>

          {/* Priority Tasks */}
          <BentoCard
            title="Priority Tasks"
            subtitle="TODAY"
            colSpan={2}
            className="min-h-[280px]"
            interactive={false}
          >
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <ListTodo className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground mb-4">No tasks yet</p>
                <Button size="sm" onClick={() => openModal('createTask')}>
                  Create your first task
                </Button>
              </div>
            ) : (
              <div className="space-y-2 mt-4">
                {tasks.map((task, i) => (
                  <TaskItem key={task.id} task={task} index={i} onToggle={() => {}} />
                ))}
              </div>
            )}
          </BentoCard>

          {/* Quick Actions */}
          <BentoCard
            title="Quick Actions"
            colSpan={1}
            gradient="bg-gradient-to-br from-white/10 to-transparent"
            interactive={false}
          >
            <div className="grid grid-cols-2 gap-3 mt-4">
              {([
                { icon: <FileText className="h-5 w-5" />, label: 'New Doc', action: 'createDocument' },
                { icon: <ListTodo className="h-5 w-5" />, label: 'New Task', action: 'createTask' },
                { icon: <Sparkles className="h-5 w-5" />, label: 'Ask AI', action: 'aiAssistant' },
                { icon: <MessageSquare className="h-5 w-5" />, label: 'Chat', href: '/dashboard/chat' },
              ] as Array<{
                icon: ReactNode;
                label: string;
                action?: 'createDocument' | 'createTask' | 'settings' | 'onboarding' | 'aiAssistant';
                href?: string;
              }>).map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => action.action && openModal(action.action)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                    {action.icon}
                  </div>
                  <span className="text-xs font-medium">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>
      </section>

    </div>
  );
}
