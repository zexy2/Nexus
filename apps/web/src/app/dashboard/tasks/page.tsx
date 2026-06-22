"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { type Task as SyncTask } from "@/lib/sync/zero";
import { useLocalFirstContext } from "@/lib/sync/local-first";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ListTodo,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  Flag,
  MoreHorizontal,
  Sparkles,
  GripVertical,
  AlertCircle,
  ArrowUpCircle,
  Search,
  Filter,
  Edit3,
  GitPullRequestArrow,
  Link2,
  Unlink,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SkeletonKanbanColumn,
} from "@/components/shared";
import { showToast } from "@/components/shared/toast-provider";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/format";
import { useT, useLocale } from "@/lib/i18n/provider";

// Types
type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeAgentType: string | null;
  agentJob?: { id: string; status: string; claimedByClient?: string | null } | null;
  dueDate?: Date;
  tags?: string[];
  alignmentStatus: "aligned" | "needs_review" | "orphaned";
  requirements: Array<{
    requirementId: string;
    stableKey: string;
    title: string;
    status: string;
  }>;
  createdAt: Date;
}

interface ApiTask extends Omit<Task, "createdAt" | "dueDate"> {
  createdAt: string | number;
  dueDate?: string | number | null;
}

function normalizeTask(task: ApiTask): Task {
  return {
    ...task,
    description: task.description || "",
    assigneeId: task.assigneeId || null,
    assigneeAgentType: task.assigneeAgentType || null,
    alignmentStatus: task.alignmentStatus || "orphaned",
    requirements: task.requirements || [],
    createdAt: new Date(task.createdAt),
    dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
  };
}

// Map a locally-synced task (IndexedDB store, numeric timestamps) to the page
// shape. Used for the local-first read path so the board renders instantly and
// works offline from cached data.
function fromSyncTask(t: SyncTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId || null,
    assigneeAgentType: t.assigneeAgentType || null,
    alignmentStatus: t.alignmentStatus || "orphaned",
    requirements: [],
    createdAt: new Date(t.createdAt),
    dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
  };
}

// Column config
const columns: { id: TaskStatus; title: string; color: string; icon: typeof Circle }[] = [
  { id: "todo", title: "Yapılacak", color: "neutral", icon: Circle },
  { id: "in_progress", title: "Devam Ediyor", color: "amber", icon: Clock },
  { id: "in_review", title: "İncelemede", color: "blue", icon: GitPullRequestArrow },
  { id: "done", title: "Tamamlandı", color: "emerald", icon: CheckCircle2 },
];

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;

  return closestCorners(args);
};

function getDragTargetStatus(overId: string | number | null | undefined, taskList: Task[]): TaskStatus | null {
  if (overId === null || overId === undefined) return null;

  const id = String(overId);
  const overTask = taskList.find((task) => task.id === id);
  if (overTask) return overTask.status === "in_review" ? null : overTask.status;

  const column = columns.find((item) => item.id === id)?.id ?? null;
  return column === "in_review" ? null : column;
}

// Priority config
const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: typeof Flag }> = {
  low: { label: "Düşük", color: "bg-neutral-100 text-neutral-600", icon: Flag },
  medium: { label: "Orta", color: "bg-blue-100 text-blue-600", icon: Flag },
  high: { label: "Yüksek", color: "bg-amber-100 text-amber-600", icon: ArrowUpCircle },
  urgent: { label: "Acil", color: "bg-red-100 text-red-600", icon: AlertCircle },
};

// Sortable Task Card
function SortableTaskCard({
  task,
  onDelete,
  onEdit,
}: {
  task: Task;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isAI = !!task.agentJob;
  const priority = priorityConfig[task.priority];
  const t = useT();
  const { locale } = useLocale();

  const formatDate = (date: Date) => {
    const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return t('tasks.today');
    if (days === 1) return t('tasks.yesterday');
    return formatRelativeDate(date, locale);
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid="kanban-task-card"
      data-task-id={task.id}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-all cursor-grab active:cursor-grabbing",
        isDragging && "shadow-2xl ring-2 ring-white/30 ring-offset-2 ring-offset-black",
        !isDragging && "hover:border-white/20 hover:bg-white/[0.03]"
      )}
    >
      {/* Header with drag handle */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          tabIndex={-1}
          className="mt-1 p-1 -ml-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4
            className={cn(
              "font-medium text-sm line-clamp-2",
              task.status === "done" && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </h4>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-white/5 border border-white/10 text-muted-foreground text-[10px] rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {task.requirements.slice(0, 3).map((requirement) => (
              <span
                key={requirement.requirementId}
                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200"
                title={requirement.title}
              >
                <Link2 className="size-2.5" />
                {requirement.stableKey}
              </span>
            ))}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                task.alignmentStatus === "aligned" &&
                  "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
                task.alignmentStatus === "needs_review" &&
                  "border-amber-400/20 bg-amber-400/10 text-amber-200",
                task.alignmentStatus === "orphaned" &&
                  "border-white/10 bg-white/5 text-white/40"
              )}
            >
              {task.alignmentStatus === "needs_review" ? (
                <GitPullRequestArrow className="size-2.5" />
              ) : task.alignmentStatus === "aligned" ? (
                <CheckCircle2 className="size-2.5" />
              ) : (
                <Unlink className="size-2.5" />
              )}
              {task.alignmentStatus === "needs_review"
                ? t('tasks.alignmentNeedsReview')
                : task.alignmentStatus === "aligned"
                  ? t('tasks.alignmentAligned')
                  : t('tasks.alignmentOrphaned')}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
            <div className="flex items-center gap-2">
              {/* Priority */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                        task.priority === "low" && "bg-neutral-500/20 text-neutral-400",
                        task.priority === "medium" && "bg-blue-500/20 text-blue-400",
                        task.priority === "high" && "bg-amber-500/20 text-amber-400",
                        task.priority === "urgent" && "bg-red-500/20 text-red-400"
                      )}
                    >
                      <priority.icon className="w-3 h-3" />
                      {t(`tasks.prio${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t('tasks.priorityLabel')}: {t(`tasks.prio${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* AI badge */}
              {isAI && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 text-white/70 text-[10px] rounded-full font-medium">
                        <Sparkles className="w-3 h-3" />
                        Agent
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('tasks.aiAssigned')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Due date / Created */}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {task.dueDate ? formatDate(task.dueDate) : formatDate(task.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 glass-premium border-white/10">
            <DropdownMenuItem
              onClick={() => onEdit(task)}
              className="flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Düzenle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(task.id)}
              className="flex items-center gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

// Static Task Card for drag overlay
function TaskCardOverlay({ task }: { task: Task }) {
  const priority = priorityConfig[task.priority];
  const isAI = !!task.agentJob;
  const t = useT();

  return (
    <div className="w-[280px] rounded-xl border border-white/20 bg-background p-4 shadow-2xl ring-2 ring-white/30 ring-offset-2 ring-offset-black">
      <div className="flex items-start gap-2">
        <div className="p-1 -ml-1">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm line-clamp-2">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10">
            <span
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                task.priority === "low" && "bg-neutral-500/20 text-neutral-400",
                task.priority === "medium" && "bg-blue-500/20 text-blue-400",
                task.priority === "high" && "bg-amber-500/20 text-amber-400",
                task.priority === "urgent" && "bg-red-500/20 text-red-400"
              )}
            >
              <priority.icon className="w-3 h-3" />
              {t(`tasks.prio${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
            </span>
            {isAI && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 text-white/70 text-[10px] rounded-full font-medium">
                <Sparkles className="w-3 h-3" />
                Agent
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Kanban Column
function KanbanColumn({
  column,
  tasks,
  onDelete,
  onEdit,
}: {
  column: typeof columns[0];
  tasks: Task[];
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}) {
  const Icon = column.icon;
  const t = useT();
  
  // Add droppable to enable dropping tasks on the column itself
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: column.id === "in_review",
  });

  const colorClasses = {
    neutral: {
      bg: "bg-white/[0.02]",
      border: "border-white/10",
      icon: "text-neutral-400",
      badge: "bg-white/10 text-neutral-300",
    },
    amber: {
      bg: "bg-white/[0.02]",
      border: "border-white/10",
      icon: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-300",
    },
    blue: {
      bg: "bg-white/[0.02]",
      border: "border-white/10",
      icon: "text-blue-400",
      badge: "bg-blue-500/20 text-blue-300",
    },
    emerald: {
      bg: "bg-white/[0.02]",
      border: "border-white/10",
      icon: "text-emerald-400",
      badge: "bg-emerald-500/20 text-emerald-300",
    },
  };

  const colors = colorClasses[column.color as keyof typeof colorClasses];

  return (
    <div className="flex min-h-0 min-w-0 flex-col md:h-full">
      {/* Column header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-2 rounded-xl", colors.bg, colors.border, "border")}>
            <Icon className={cn("w-4 h-4", colors.icon)} />
          </div>
          <h3 className="font-semibold text-sm md:text-base">
            {t(`tasks.col${column.id === "todo" ? "Todo" : column.id === "in_progress" ? "InProgress" : column.id === "in_review" ? "InReview" : "Done"}`)}
          </h3>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              colors.badge
            )}
          >
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Tasks container - now with droppable ref */}
      <div
        ref={setNodeRef}
        data-testid={`kanban-column-${column.id}`}
        onWheel={(event) => {
          const el = event.currentTarget;
          const maxScrollTop = el.scrollHeight - el.clientHeight;
          if (maxScrollTop <= 0) return;

          const nextScrollTop = Math.max(
            0,
            Math.min(maxScrollTop, el.scrollTop + event.deltaY)
          );

          if (nextScrollTop !== el.scrollTop) {
            event.preventDefault();
            event.stopPropagation();
            el.scrollTop = nextScrollTop;
          }
        }}
        className={cn(
          "max-h-[70vh] min-h-[22rem] overflow-y-auto overscroll-contain rounded-2xl border p-3 pr-2 transition-colors [scrollbar-gutter:stable] md:h-full md:max-h-none md:min-h-0 md:flex-1",
          colors.bg,
          colors.border,
          isOver && "ring-2 ring-primary/50 bg-primary/5"
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))}
            </AnimatePresence>

            {tasks.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "flex flex-col items-center justify-center py-12 text-neutral-400",
                  isOver && "text-primary"
                )}
              >
                <Icon className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">{isOver ? t('tasks.dropHere') : t('tasks.noTasks')}</p>
              </motion.div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { engine, userId, workspaceId } = useLocalFirstContext();
  const t = useT();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Track the in-progress drag so background sync doesn't clobber it.
  const activeIdRef = useRef<string | null>(null);
  const dragTargetStatusRef = useRef<TaskStatus | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchTasks = useCallback(async () => {
    // Local-first read: render cached tasks from IndexedDB instantly (and while
    // offline), then refresh from the network when it is reachable.
    let renderedFromCache = false;
    if (engine) {
      try {
        const local = await engine.query<SyncTask>("tasks");
        if (local.length > 0) {
          setTasks(local.filter((task) => !task.isArchived).map(fromSyncTask));
          setIsLoading(false);
          renderedFromCache = true;
        }
      } catch {
        // Cache miss is non-fatal; fall through to the network.
      }
    }

    if (!renderedFromCache) setIsLoading(true);

    try {
      const response = await fetch("/api/tasks");
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.status}`);
      }

      const data = await response.json();
      setTasks(Array.isArray(data) ? data.map(normalizeTask) : []);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      // Offline with no cache is the only case the user sees nothing.
      if (!renderedFromCache) {
        showToast.error(t('tasks.toastLoadFailed'));
        setTasks([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [engine, t]);

  useEffect(() => {
    void fetchTasks();

    // Re-read the local store when the background sync updates it, unless a drag
    // is in progress (so optimistic reordering isn't clobbered mid-gesture).
    if (!engine) return;
    return engine.subscribe("tasks", async () => {
      if (activeIdRef.current) return;
      try {
        const local = await engine.query<SyncTask>("tasks");
        setTasks((current) => {
          const currentById = new Map(current.map((task) => [task.id, task]));
          return local
            .filter((task) => !task.isArchived)
            .map((task) => {
              const cached = currentById.get(task.id);
              const normalized = fromSyncTask(task);
              return {
                ...normalized,
                requirements: cached?.requirements || normalized.requirements,
              };
            });
        });
      } catch {
        // ignore
      }
    });
  }, [engine, fetchTasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = filterPriority === "all" || task.priority === filterPriority;
      return matchesSearch && matchesPriority;
    });
  }, [tasks, searchQuery, filterPriority]);

  // Get tasks by status
  const getTasksByStatus = useCallback(
    (status: TaskStatus) => filteredTasks.filter((t) => t.status === status),
    [filteredTasks]
  );

  // Find active task for drag overlay
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId),
    [tasks, activeId]
  );

  // Stats
  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    aiTasks: tasks.filter((t) => !!t.agentJob).length,
  }), [tasks]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    activeIdRef.current = id;
    dragTargetStatusRef.current = null;
    setActiveId(id);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;
    if (activeTask.status === "in_review") return;

    const targetStatus = getDragTargetStatus(over.id, tasks);
    dragTargetStatusRef.current = targetStatus;

    if (targetStatus && activeTask.status !== targetStatus) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === active.id ? { ...t, status: targetStatus! } : t
        )
      );
    }
  }, [tasks]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;

    const movedTask = tasks.find((task) => task.id === active.id);
    if (movedTask?.status === "in_review") {
      activeIdRef.current = null;
      dragTargetStatusRef.current = null;
      return;
    }
    const targetStatus =
      getDragTargetStatus(over?.id, tasks) ||
      dragTargetStatusRef.current ||
      movedTask?.status ||
      null;

    try {
      if (!movedTask || !targetStatus) return;

      setTasks((prev) => {
        const activeIndex = prev.findIndex((task) => task.id === active.id);
        if (activeIndex === -1) return prev;

        const overIndex = over ? prev.findIndex((task) => task.id === over.id) : -1;
        const overIsColumn = over ? columns.some((column) => column.id === over.id) : false;
        const newTasks = [...prev];
        const [removed] = newTasks.splice(activeIndex, 1);
        const moved = { ...removed, status: targetStatus };

        if (overIndex !== -1 && over?.id !== active.id) {
          const adjustedIndex = overIndex > activeIndex ? overIndex - 1 : overIndex;
          newTasks.splice(adjustedIndex, 0, moved);
        } else if (overIsColumn || dragTargetStatusRef.current) {
          newTasks.push(moved);
        } else {
          newTasks.splice(activeIndex, 0, moved);
        }

        return newTasks;
      });

      // Local-first: persist the new status to the local store and queue the sync.
      if (engine) {
        const existing = await engine.get<SyncTask>("tasks", movedTask.id);
        if (existing) {
          await engine.mutate<SyncTask>("tasks", "update", {
            ...existing,
            status: targetStatus,
            updatedAt: Date.now(),
          });
          showToast.success(t('tasks.toastMoved'));
          return;
        }
      }

      const response = await fetch(`/api/tasks/${movedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!response.ok) throw new Error(`Failed to move task: ${response.status}`);
      showToast.success(t('tasks.toastMoved'));
    } catch (error) {
      console.error("Failed to persist task move:", error);
      showToast.error(t('tasks.toastMoveFailed'));
      void fetchTasks();
    } finally {
      activeIdRef.current = null;
      dragTargetStatusRef.current = null;
    }
  }, [fetchTasks, tasks, engine, t]);

  // CRUD handlers
  const resetNewTask = useCallback(() => {
    setNewTask({ title: "", description: "", priority: "medium" });
    setIsCreateOpen(false);
  }, []);

  const handleCreateTask = useCallback(async () => {
    if (!newTask.title.trim()) {
      showToast.warning(t('tasks.toastEnterTitle'));
      return;
    }

    // Local-first: optimistic insert written to the local store and queued for
    // sync — works offline. The subscription re-read renders it instantly.
    if (engine && workspaceId && userId) {
      const now = Date.now();
      await engine.mutate<SyncTask>("tasks", "insert", {
        id: crypto.randomUUID(),
        workspaceId,
        title: newTask.title.trim(),
        description: newTask.description,
        status: "todo",
        priority: newTask.priority,
        assigneeId: userId,
        createdBy: userId,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      resetNewTask();
      showToast.success(t('tasks.toastCreated'));
      return;
    }

    // Fallback: network create (sync engine not ready yet).
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create task: ${response.status}`);
      }

      const created = normalizeTask(await response.json());
      setTasks((prev) => [created, ...prev]);
      resetNewTask();
      showToast.success(t('tasks.toastCreated'));
    } catch (error) {
      console.error("Failed to create task:", error);
      showToast.error(t('tasks.toastCreateFailed'));
    }
  }, [newTask, engine, workspaceId, userId, resetNewTask, t]);

  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return;

    // Local-first: merge changes into the cached row and queue the sync.
    if (engine) {
      const existing = await engine.get<SyncTask>("tasks", editingTask.id);
      if (existing) {
        await engine.mutate<SyncTask>("tasks", "update", {
          ...existing,
          title: editingTask.title,
          description: editingTask.description,
          priority: editingTask.priority,
          status: editingTask.status,
          updatedAt: Date.now(),
        });
        setEditingTask(null);
        showToast.success(t('tasks.toastUpdated'));
        return;
      }
    }

    // Fallback: network update.
    try {
      const response = await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingTask.title,
          description: editingTask.description,
          priority: editingTask.priority,
          status: editingTask.status,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.status}`);
      }

      const updated = normalizeTask({
        ...editingTask,
        ...(await response.json()),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? updated : t))
      );
      setEditingTask(null);
      showToast.success(t('tasks.toastUpdated'));
    } catch (error) {
      console.error("Failed to update task:", error);
      showToast.error(t('tasks.toastUpdateFailed'));
      void fetchTasks();
    }
  }, [editingTask, engine, fetchTasks, t]);

  const handleDeleteTask = useCallback(async (id: string) => {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));

    // Local-first: optimistic delete + queued sync.
    if (engine) {
      try {
        await engine.mutate<SyncTask>("tasks", "delete", { id } as SyncTask);
        showToast.success(t('tasks.toastDeleted'));
      } catch (error) {
        console.error("Failed to delete task:", error);
        showToast.error(t('tasks.toastDeleteFailed'));
        setTasks(previousTasks);
      }
      return;
    }

    // Fallback: network delete.
    try {
      const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Failed to delete task: ${response.status}`);
      }
      showToast.success(t('tasks.toastDeleted'));
    } catch (error) {
      console.error("Failed to delete task:", error);
      showToast.error(t('tasks.toastDeleteFailed'));
      setTasks(previousTasks);
    }
  }, [tasks, engine, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse h-12 bg-white/5 rounded-lg w-48 mb-8" />
          <div className="flex gap-6">
            <SkeletonKanbanColumn />
            <SkeletonKanbanColumn />
            <SkeletonKanbanColumn />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-24 pt-10 md:px-8">
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-white/35">
            <ListTodo className="size-4" />
            {t('tasks.label')}
          </div>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{t('tasks.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {t('tasks.description')}
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          {t('tasks.newTask')}
        </Button>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-5">
        {[
          [t('tasks.statTotal'), stats.total],
          [t('tasks.statTodo'), stats.todo],
          [t('tasks.statInProgress'), stats.inProgress],
          [t('tasks.statDone'), stats.done],
          [t('tasks.statAi'), stats.aiTasks],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-background px-4 py-5">
            <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
            <div className="mt-1 text-xs text-white/40">{label}</div>
          </div>
        ))}
      </section>

      <section className="mb-6 border-b border-white/10 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center md:gap-4"
        >
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <Input
              placeholder={t('tasks.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border-white/10 bg-white/[0.03] pl-10 text-white placeholder:text-white/40"
            />
          </div>

          <Select
            value={filterPriority}
            onValueChange={(value) => setFilterPriority(value as TaskPriority | "all")}
          >
            <SelectTrigger className="w-full rounded-lg border-white/10 bg-white/[0.03] sm:w-44">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-white/40" />
                <SelectValue placeholder={t('tasks.priorityLabel')} />
              </div>
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
              <SelectItem value="all">{t('tasks.filterAll')}</SelectItem>
              <SelectItem value="urgent">{t('tasks.prioUrgent')}</SelectItem>
              <SelectItem value="high">{t('tasks.prioHigh')}</SelectItem>
              <SelectItem value="medium">{t('tasks.prioMedium')}</SelectItem>
              <SelectItem value="low">{t('tasks.prioLow')}</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>
      </section>

      <section className="min-h-[520px] md:min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="min-h-0 overflow-x-auto pb-6"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={kanbanCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid min-h-0 grid-cols-1 items-start gap-4 md:h-[calc(100vh-21rem)] md:min-h-[34rem] md:max-h-[44rem] md:grid-cols-2 md:items-stretch md:gap-5 xl:grid-cols-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={getTasksByStatus(column.id)}
                  onDelete={handleDeleteTask}
                  onEdit={setEditingTask}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
        </motion.div>
      </section>

      {/* Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tasks.dialogCreateTitle')}</DialogTitle>
            <DialogDescription>
              {t('tasks.dialogCreateDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">{t('tasks.fieldTitle')}</Label>
              <Input
                placeholder={t('tasks.fieldTitlePlaceholder')}
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                className="mt-1.5"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-sm font-medium">{t('tasks.fieldDesc')}</Label>
              <Textarea
                placeholder={t('tasks.fieldDescPlaceholder')}
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, description: e.target.value }))
                }
                className="mt-1.5 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">{t('tasks.fieldPriority')}</Label>
              <Select
                value={newTask.priority}
                onValueChange={(value: TaskPriority) =>
                  setNewTask((prev) => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-neutral-400" />
                      {t('tasks.prioLow')}
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-blue-500" />
                      {t('tasks.prioMedium')}
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-amber-500" />
                      {t('tasks.prioHigh')}
                    </span>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {t('tasks.prioUrgent')}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!newTask.title.trim()}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tasks.dialogEditTitle')}</DialogTitle>
          </DialogHeader>

          {editingTask && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">{t('tasks.fieldTitle')}</Label>
                <Input
                  value={editingTask.title}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, title: e.target.value })
                  }
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">{t('tasks.fieldDesc')}</Label>
                <Textarea
                  value={editingTask.description}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, description: e.target.value })
                  }
                  className="mt-1.5 min-h-[80px]"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">{t('tasks.fieldPriority')}</Label>
                <Select
                  value={editingTask.priority}
                  onValueChange={(value: TaskPriority) =>
                    setEditingTask({ ...editingTask, priority: value })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tasks.prioLow')}</SelectItem>
                    <SelectItem value="medium">{t('tasks.prioMedium')}</SelectItem>
                    <SelectItem value="high">{t('tasks.prioHigh')}</SelectItem>
                    <SelectItem value="urgent">{t('tasks.prioUrgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">{t('tasks.fieldStatus')}</Label>
                <Select
                  value={editingTask.status}
                  onValueChange={(value: TaskStatus) =>
                    setEditingTask({ ...editingTask, status: value })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">{t('tasks.colTodo')}</SelectItem>
                    <SelectItem value="in_progress">{t('tasks.colInProgress')}</SelectItem>
                    <SelectItem value="done">{t('tasks.colDone')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleUpdateTask}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
