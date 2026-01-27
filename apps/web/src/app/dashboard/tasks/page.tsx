"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  Plus,
  Bot,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  Flag,
  MoreHorizontal,
  Sparkles,
  GripVertical,
  User,
  Tag,
  AlertCircle,
  ArrowUpCircle,
  Search,
  Filter,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  PageHeader,
  EmptyState,
  SkeletonKanbanColumn,
} from "@/components/shared";
import { showToast } from "@/components/shared/toast-provider";
import { cn } from "@/lib/utils";

// Premium Components
import { TasksBackground } from "./_components/tasks-background";
import { TasksHeroHeader } from "./_components/tasks-hero-header";
import { StatsOverview } from "./_components/stats-overview";

// Types
type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeAgentType: string | null;
  dueDate?: Date;
  tags?: string[];
  createdAt: Date;
}

// Column config
const columns: { id: TaskStatus; title: string; color: string; icon: typeof Circle }[] = [
  { id: "todo", title: "Yapılacak", color: "neutral", icon: Circle },
  { id: "in_progress", title: "Devam Ediyor", color: "amber", icon: Clock },
  { id: "done", title: "Tamamlandı", color: "emerald", icon: CheckCircle2 },
];

// Priority config
const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: typeof Flag }> = {
  low: { label: "Düşük", color: "bg-neutral-100 text-neutral-600", icon: Flag },
  medium: { label: "Orta", color: "bg-blue-100 text-blue-600", icon: Flag },
  high: { label: "Yüksek", color: "bg-amber-100 text-amber-600", icon: ArrowUpCircle },
  urgent: { label: "Acil", color: "bg-red-100 text-red-600", icon: AlertCircle },
};

// Sample tasks
const sampleTasks: Task[] = [
  {
    id: "1",
    title: "API entegrasyonunu tamamla",
    description: "REST API endpoint'lerini implemente et",
    status: "in_progress",
    priority: "high",
    assigneeId: null,
    assigneeAgentType: "developer",
    tags: ["api", "backend"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: "2",
    title: "Kullanıcı testlerini yap",
    description: "5 kullanıcı ile görüşme yap",
    status: "todo",
    priority: "medium",
    assigneeId: "user1",
    assigneeAgentType: null,
    tags: ["ux", "araştırma"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
  },
  {
    id: "3",
    title: "Dökümantasyon güncelle",
    description: "API dökümantasyonunu güncelle",
    status: "todo",
    priority: "low",
    assigneeId: null,
    assigneeAgentType: "writer",
    tags: ["docs"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
  },
  {
    id: "4",
    title: "Sprint retrospektifi",
    description: "Ekip ile retrospektif toplantısı",
    status: "done",
    priority: "medium",
    assigneeId: "user1",
    assigneeAgentType: null,
    tags: ["toplantı"],
    dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
  },
  {
    id: "5",
    title: "Performans optimizasyonu",
    description: "Sayfa yüklenme süresini iyileştir",
    status: "in_progress",
    priority: "urgent",
    assigneeId: null,
    assigneeAgentType: "developer",
    tags: ["performance"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
  },
];

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

  const isAI = !!task.assigneeAgentType;
  const priority = priorityConfig[task.priority];

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Bugün";
    if (days === 1) return "Dün";
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString("tr-TR");
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group glass-premium border-white/10 rounded-2xl p-4 transition-all cursor-default",
        isDragging && "shadow-2xl ring-2 ring-white/30 ring-offset-2 ring-offset-black",
        !isDragging && "hover:border-white/20 hover:bg-white/[0.03]"
      )}
    >
      {/* Header with drag handle */}
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
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
                      {priority.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Öncelik: {priority.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* AI badge */}
              {isAI && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full font-medium">
                        <Sparkles className="w-3 h-3" />
                        AI
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>AI Ajanına atandı</TooltipContent>
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
  const isAI = !!task.assigneeAgentType;

  return (
    <div className="glass-premium border-white/20 rounded-2xl p-4 shadow-2xl ring-2 ring-white/30 ring-offset-2 ring-offset-black w-[280px]">
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
              {priority.label}
            </span>
            {isAI && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full font-medium">
                <Sparkles className="w-3 h-3" />
                AI
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
  
  // Add droppable to enable dropping tasks on the column itself
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const colorClasses = {
    neutral: {
      bg: "bg-white/[0.02]",
      border: "border-white/5",
      icon: "text-neutral-400",
      badge: "bg-white/10 text-neutral-300",
    },
    amber: {
      bg: "bg-amber-500/[0.03]",
      border: "border-amber-500/10",
      icon: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-300",
    },
    emerald: {
      bg: "bg-emerald-500/[0.03]",
      border: "border-emerald-500/10",
      icon: "text-emerald-400",
      badge: "bg-emerald-500/20 text-emerald-300",
    },
  };

  const colors = colorClasses[column.color as keyof typeof colorClasses];

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-2 rounded-xl", colors.bg, colors.border, "border")}>
            <Icon className={cn("w-4 h-4", colors.icon)} />
          </div>
          <h3 className="font-semibold text-sm md:text-base">{column.title}</h3>
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
        className={cn(
          "flex-1 rounded-2xl p-3 min-h-[200px] transition-colors border",
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
                <p className="text-sm">{isOver ? "Buraya bırak" : "Görev yok"}</p>
              </motion.div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(sampleTasks);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    assignToAgent: false,
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
    aiTasks: tasks.filter((t) => !!t.assigneeAgentType).length,
  }), [tasks]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    const overTask = tasks.find((t) => t.id === over.id);

    if (!activeTask) return;

    // Determine target status
    let targetStatus: TaskStatus | null = null;

    if (overTask) {
      // Dropped on another task
      targetStatus = overTask.status;
    } else if (typeof over.id === "string") {
      // Check if dropped on column (over.id might be column id)
      const column = columns.find((c) => c.id === over.id);
      if (column) {
        targetStatus = column.id;
      }
    }

    if (targetStatus && activeTask.status !== targetStatus) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === active.id ? { ...t, status: targetStatus! } : t
        )
      );
    }
  }, [tasks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Reorder within same column
    setTasks((prev) => {
      const activeIndex = prev.findIndex((t) => t.id === active.id);
      const overIndex = prev.findIndex((t) => t.id === over.id);

      if (activeIndex === -1) return prev;

      const newTasks = [...prev];
      const [removed] = newTasks.splice(activeIndex, 1);
      
      if (overIndex !== -1) {
        newTasks.splice(overIndex, 0, removed);
      } else {
        newTasks.push(removed);
      }

      return newTasks;
    });

    showToast.success("Görev taşındı");
  }, []);

  // CRUD handlers
  const handleCreateTask = useCallback(() => {
    if (!newTask.title.trim()) {
      showToast.warning("Lütfen görev başlığı girin");
      return;
    }

    const task: Task = {
      id: Date.now().toString(),
      title: newTask.title,
      description: newTask.description,
      status: "todo",
      priority: newTask.priority,
      assigneeId: newTask.assignToAgent ? null : "user1",
      assigneeAgentType: newTask.assignToAgent ? "assistant" : null,
      createdAt: new Date(),
    };

    setTasks((prev) => [task, ...prev]);
    setNewTask({
      title: "",
      description: "",
      priority: "medium",
      assignToAgent: false,
    });
    setIsCreateOpen(false);
    showToast.success("Görev oluşturuldu");
  }, [newTask]);

  const handleUpdateTask = useCallback(() => {
    if (!editingTask) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === editingTask.id ? editingTask : t))
    );
    setEditingTask(null);
    showToast.success("Görev güncellendi");
  }, [editingTask]);

  const handleDeleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast.success("Görev silindi");
  }, []);

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
    <div className="relative min-h-screen pb-32">
      {/* Premium Animated Background */}
      <TasksBackground />
      
      {/* Content Layer */}
      <div className="relative z-10 px-4 md:px-6 lg:px-8">
        {/* Premium Hero Header */}
        <TasksHeroHeader 
          stats={stats}
          onCreateTask={() => setIsCreateOpen(true)}
        />

        {/* Premium Stats Bar */}
        <StatsOverview stats={stats} />

        {/* Toolbar */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4"
          >
            {/* Search */}
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Görev ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/[0.03] border-white/10 rounded-full w-full text-white placeholder:text-white/40"
              />
            </div>

            {/* Priority filter */}
            <Select
              value={filterPriority}
              onValueChange={(value) => setFilterPriority(value as TaskPriority | "all")}
            >
              <SelectTrigger className="w-full sm:w-40 bg-white/[0.03] border-white/10 rounded-full">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-white/40" />
                  <SelectValue placeholder="Öncelik" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="urgent">Acil</SelectItem>
                <SelectItem value="high">Yüksek</SelectItem>
                <SelectItem value="medium">Orta</SelectItem>
                <SelectItem value="low">Düşük</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        </section>

        {/* Kanban Board */}
        <section>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="overflow-x-auto pb-6"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
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

              {/* Drag overlay */}
              <DragOverlay>
                {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
              </DragOverlay>
            </DndContext>
          </motion.div>
        </section>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Görev Oluştur</DialogTitle>
            <DialogDescription>
              Kendiniz için veya AI ajanına görev atayın
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">Başlık</Label>
              <Input
                placeholder="Görev başlığı..."
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                className="mt-1.5"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Açıklama</Label>
              <Textarea
                placeholder="Görev açıklaması..."
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, description: e.target.value }))
                }
                className="mt-1.5 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Öncelik</Label>
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
                      Düşük
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-blue-500" />
                      Orta
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-amber-500" />
                      Yüksek
                    </span>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      Acil
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="assignToAgent"
                checked={newTask.assignToAgent}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    assignToAgent: e.target.checked,
                  }))
                }
                className="rounded border-neutral-300"
              />
              <Label
                htmlFor="assignToAgent"
                className="text-sm flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-violet-500" />
                AI Ajanına Ata
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              İptal
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!newTask.title.trim()}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Görevi Düzenle</DialogTitle>
          </DialogHeader>

          {editingTask && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">Başlık</Label>
                <Input
                  value={editingTask.title}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, title: e.target.value })
                  }
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Açıklama</Label>
                <Textarea
                  value={editingTask.description}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, description: e.target.value })
                  }
                  className="mt-1.5 min-h-[80px]"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Öncelik</Label>
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
                    <SelectItem value="low">Düşük</SelectItem>
                    <SelectItem value="medium">Orta</SelectItem>
                    <SelectItem value="high">Yüksek</SelectItem>
                    <SelectItem value="urgent">Acil</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Durum</Label>
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
                    <SelectItem value="todo">Yapılacak</SelectItem>
                    <SelectItem value="in_progress">Devam Ediyor</SelectItem>
                    <SelectItem value="done">Tamamlandı</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>
              İptal
            </Button>
            <Button
              onClick={handleUpdateTask}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
