"use client";

import { useState, useCallback, useEffect, useMemo, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import CountUp from "react-countup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

// Premium Components
import { PremiumBackground, PremiumHeroHeader } from "@/components/premium";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  BrainCircuit,
  Search,
  FileText,
  Code,
  Kanban,
  CheckCircle2,
  Clock,
  Activity,
  Zap,
  Play,
  Pause,
  Plus,
  Rocket,
  Loader2,
  Sparkles,
  RefreshCw,
  Filter,
  MoreVertical,
  Eye,
  Trash2,
  Copy,
  TrendingUp,
  Timer,
  Target,
  BarChart3,
  XCircle,
  MessageSquare,
  Settings,
  ChevronDown,
  RotateCcw,
  Cpu,
  Layers,
} from "lucide-react";

// Workflow types
type WorkflowType = "document" | "research" | "task" | "code";

interface WorkflowExecution {
  id: string;
  type: WorkflowType;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  output?: string;
  progress: number;
  currentStep?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

const workflowConfig: Record<WorkflowType, { 
  name: string; 
  description: string; 
  icon: typeof FileText;
  color: string;
  fields: { name: string; label: string; type: "text" | "textarea" | "select"; options?: string[] }[];
}> = {
  document: {
    name: "Document Generation",
    description: "Generate comprehensive documents using AI agents",
    icon: FileText,
    color: "bg-white/10",
    fields: [
      { name: "topic", label: "Topic", type: "text" },
      { name: "format", label: "Format", type: "select", options: ["report", "article", "documentation", "proposal"] },
      { name: "context", label: "Additional Context", type: "textarea" },
    ],
  },
  research: {
    name: "Deep Research",
    description: "Conduct thorough research on any topic",
    icon: Search,
    color: "bg-white/10",
    fields: [
      { name: "query", label: "Research Query", type: "text" },
      { name: "depth", label: "Research Depth", type: "select", options: ["quick", "standard", "deep", "comprehensive"] },
      { name: "sources", label: "Preferred Sources", type: "textarea" },
    ],
  },
  task: {
    name: "Task Breakdown",
    description: "Break down complex projects into actionable tasks",
    icon: Kanban,
    color: "bg-white/10",
    fields: [
      { name: "goal", label: "Project Goal", type: "text" },
      { name: "timeline", label: "Timeline", type: "select", options: ["1 week", "2 weeks", "1 month", "3 months"] },
      { name: "requirements", label: "Requirements", type: "textarea" },
    ],
  },
  code: {
    name: "Code Generation",
    description: "Generate production-ready code with best practices",
    icon: Code,
    color: "bg-white/10",
    fields: [
      { name: "task", label: "Task Description", type: "textarea" },
      { name: "language", label: "Language", type: "select", options: ["typescript", "python", "rust", "go"] },
      { name: "context", label: "Code Context", type: "textarea" },
    ],
  },
};

// Agent type configurations (static - these define available agent types)
const AGENT_TYPES = [
  {
    id: "supervisor",
    name: "Supervisor",
    description: "Orchestrates and delegates tasks to specialized agents",
    icon: BrainCircuit,
    color: "bg-white/10",
    capabilities: ["Task Routing", "Agent Coordination", "Self-Correction", "Reflection"],
    model: "gemini-2.5-flash",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Searches the web and internal documents for information",
    icon: Search,
    color: "bg-white/10",
    capabilities: ["Web Search", "RAG", "Document Analysis", "Fact Verification"],
    model: "gemini-2.5-flash",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Creates and edits documents, reports, and content",
    icon: FileText,
    color: "bg-white/10",
    capabilities: ["Content Generation", "Editing", "Formatting", "Summarization"],
    model: "gemini-2.5-flash",
  },
  {
    id: "coder",
    name: "Coder",
    description: "Writes, reviews, and explains code",
    icon: Code,
    color: "bg-white/10",
    capabilities: ["Code Generation", "Code Review", "Debugging", "Documentation"],
    model: "gemini-2.5-flash",
  },
  {
    id: "project_manager",
    name: "Project Manager",
    description: "Creates tasks, manages schedules, and tracks progress",
    icon: Kanban,
    color: "bg-white/10",
    capabilities: ["Task Creation", "Scheduling", "Progress Tracking", "Resource Allocation"],
    model: "gemini-2.5-flash",
  },
];

// Execution type from API
interface Execution {
  id: string;
  workspaceId: string;
  agentType: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  workflowId?: string | null;
  duration: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

function formatExecutionPreview(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.tasks)) {
      return `${record.tasks.length} task${record.tasks.length === 1 ? "" : "s"} created`;
    }
    if (Array.isArray(record.steps)) {
      return `${record.steps.length} workflow step${record.steps.length === 1 ? "" : "s"} recorded`;
    }
    if (typeof record.documentId === "string") {
      return `Document created: ${record.title || record.documentId}`;
    }
    const primary = record.message || record.query || record.result || record.content;
    if (typeof primary === "string") {
      return primary;
    }
    return JSON.stringify(record).slice(0, 80);
  }

  return String(value);
}

function extractExecutionSteps(output: unknown): Array<Record<string, unknown>> {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as Record<string, unknown>;
  if (Array.isArray(record.steps)) return record.steps as Array<Record<string, unknown>>;
  if (record.result && typeof record.result === "object" && !Array.isArray(record.result)) {
    const nested = record.result as Record<string, unknown>;
    if (Array.isArray(nested.steps)) return nested.steps as Array<Record<string, unknown>>;
  }
  return [];
}

function executionToWorkflowType(execution: Execution): WorkflowType {
  const inputType = execution.input?.workflowType;
  if (inputType === "tasks") return "task";
  if (inputType === "document" || inputType === "research" || inputType === "code") {
    return inputType;
  }
  if (execution.agentType === "project_manager") return "task";
  if (execution.agentType === "researcher") return "research";
  if (execution.agentType === "coder") return "code";
  return "document";
}

function executionToActiveWorkflow(execution: Execution): WorkflowExecution {
  const progress = execution.status === "completed" || execution.status === "failed" ? 100 : 65;
  return {
    id: execution.workflowId || execution.id,
    type: executionToWorkflowType(execution),
    status: execution.status === "completed" || execution.status === "failed" ? execution.status : "running",
    input: execution.input || {},
    output: execution.output ? formatExecutionPreview(execution.output) : undefined,
    progress,
    currentStep: execution.status === "running" ? "Workflow running in Temporal..." : undefined,
    startedAt: execution.startedAt || execution.createdAt,
    completedAt: execution.completedAt || undefined,
    error: execution.error || undefined,
  };
}

const statusConfig = {
  completed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-100", label: "Completed" },
  running: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-100", label: "Running" },
  failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-100", label: "Failed" },
  pending: { icon: Clock, color: "text-gray-500", bg: "bg-gray-100", label: "Pending" },
};

interface MetricItem {
  label: string;
  value: number;
  isNumeric: boolean;
  suffix?: string;
  displayValue?: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  glow: string;
  caption: string;
}

function MetricCard({ metric, index }: { metric: MetricItem; index: number }) {
  const Icon = metric.icon;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      key={metric.label}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: 0.2 + index * 0.08,
        type: 'spring',
        stiffness: 150,
        damping: 20,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative p-5 rounded-2xl overflow-hidden cursor-default bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        className={`absolute inset-0 -z-10 blur-2xl transition-opacity duration-500 ${metric.glow}`}
      />

      <div className="relative flex items-center gap-4">
        <motion.div
          animate={{
            scale: isHovered ? 1.1 : 1,
            rotate: isHovered ? 5 : 0,
          }}
          transition={{ type: 'spring', stiffness: 300 }}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${metric.bg}`}
        >
          <Icon className={`w-6 h-6 ${metric.color}`} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              {metric.isNumeric ? (
                <>
                  <CountUp
                    end={metric.value}
                    duration={2}
                    delay={0.3 + index * 0.1}
                    decimals={metric.suffix === "s" ? 1 : 0}
                    separator=","
                  />
                  {metric.suffix}
                </>
              ) : (
                metric.displayValue || metric.value
              )}
            </span>
          </div>
          <div className="text-sm text-white/40 font-medium truncate">{metric.label}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/35">
        <Clock className="size-3 text-white/30" />
        <span className="truncate">{metric.caption}</span>
      </div>
    </motion.div>
  );
}

// Metrics Dashboard Component with Premium Animations
function MetricsDashboard({ executions = [] }: { executions?: Execution[] }) {
  const totalExecutions = executions?.length || 0;
  const completedToday = executions?.filter(e => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return e.status === "completed" && e.completedAt && e.completedAt > today.getTime();
  }).length || 0;
  const successRate = totalExecutions > 0 
    ? Math.round((executions.filter(e => e.status === "completed").length / totalExecutions) * 100) 
    : 0;
  const completedWithDuration = executions?.filter(e => e.completedAt && e.startedAt) || [];
  const avgDuration = completedWithDuration.length > 0
    ? completedWithDuration.reduce((acc, e) => acc + ((e.completedAt || 0) - (e.startedAt || 0)), 0) / completedWithDuration.length
    : 0;

  const metrics: MetricItem[] = [
    { 
      label: "Total Executions", 
      value: totalExecutions, 
      isNumeric: true,
      icon: BarChart3, 
      color: "text-white/70",
      bg: "bg-white/5",
      glow: "bg-white/10",
      caption: "Recorded in workflow history",
    },
    { 
      label: "Completed Today", 
      value: completedToday, 
      isNumeric: true,
      icon: Target, 
      color: "text-white/70",
      bg: "bg-white/5",
      glow: "bg-white/10",
      caption: "Completed since local midnight",
    },
    { 
      label: "Success Rate", 
      value: successRate, 
      isNumeric: true,
      suffix: "%",
      icon: TrendingUp, 
      color: "text-white/70",
      bg: "bg-white/5",
      glow: "bg-white/10",
      caption: "Completed divided by total",
    },
    { 
      label: "Avg Response", 
      value: avgDuration > 0 ? Number((avgDuration / 1000).toFixed(1)) : 0, 
      isNumeric: avgDuration > 0,
      suffix: "s",
      displayValue: avgDuration > 0 ? `${(avgDuration / 1000).toFixed(1)}s` : "—",
      icon: Timer, 
      color: "text-white/70",
      bg: "bg-white/5",
      glow: "bg-white/10",
      caption: "Average completed duration",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {metrics.map((metric, index) => (
        <MetricCard key={metric.label} metric={metric} index={index} />
      ))}
    </div>
  );
}

// Execution Detail Dialog
function ExecutionDetailDialog({ 
  execution, 
  open, 
  onOpenChange 
}: { 
  execution: Execution | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  if (!execution) return null;

  const agent = AGENT_TYPES.find(a => a.id === execution.agentType);
  const status = statusConfig[execution.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;
  const AgentIcon = agent?.icon || BrainCircuit;

  const formatJson = (obj: unknown) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };
  const steps = extractExecutionSteps(execution.output);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-lg ${agent?.color || "bg-gray-500"} flex items-center justify-center`}>
              <AgentIcon className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {agent?.name || execution.agentType} Execution
                <Badge variant="secondary" className={`gap-1 ${status.bg}`}>
                  <StatusIcon className={`size-3 ${status.color} ${execution.status === "running" ? "animate-spin" : ""}`} />
                  {status.label}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                ID: {execution.id}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Timing Information */}
            <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Started</p>
                <p className="text-sm font-medium">
                  {execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-sm font-medium">
                  {execution.completedAt ? new Date(execution.completedAt).toLocaleString() : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-medium">{execution.duration || "-"}</p>
              </div>
            </div>

            {/* Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Input</Label>
              <pre className="p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-40">
                {formatJson(execution.input)}
              </pre>
            </div>

            {/* Workflow Steps */}
            {steps.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Activity className="size-4 text-blue-500" />
                  Workflow Steps
                </Label>
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={index} className="rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {typeof step.agentName === "string"
                            ? step.agentName
                            : typeof step.agentId === "string"
                              ? step.agentId
                              : `Step ${index + 1}`}
                        </p>
                        {typeof step.duration === "number" && (
                          <Badge variant="outline" className="text-xs">
                            {(step.duration / 1000).toFixed(1)}s
                          </Badge>
                        )}
                      </div>
                      {typeof step.output === "string" && (
                        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                          {step.output}
                        </p>
                      )}
                      {typeof step.error === "string" && (
                        <p className="mt-2 text-xs text-destructive">{step.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output */}
            {execution.output && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-500" />
                  Output
                </Label>
                <pre className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-sm overflow-x-auto max-h-60 text-green-800 dark:text-green-200">
                  {formatJson(execution.output)}
                </pre>
              </div>
            )}

            {/* Error */}
            {execution.error && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="size-4 text-red-500" />
                  Error
                </Label>
                <pre className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm overflow-x-auto max-h-40 text-red-800 dark:text-red-200">
                  {execution.error}
                </pre>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(execution, null, 2));
          }}>
            <Copy className="size-4 mr-2" />
            Copy JSON
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Workflow launcher component
function WorkflowLauncher({ 
  onLaunch 
}: { 
  onLaunch: (type: WorkflowType, input: Record<string, string>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkflowType>("document");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLaunching, setIsLaunching] = useState(false);

  const config = workflowConfig[selectedType];

  const handleLaunch = async () => {
    setIsLaunching(true);
    try {
      await onLaunch(selectedType, formData);
      setFormData({});
      setOpen(false);
    } catch (error) {
      console.error("Failed to launch workflow:", error);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-5 text-primary" />
            Launch AI Workflow
          </DialogTitle>
          <DialogDescription>
            Start a new AI-powered workflow to accomplish complex tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Workflow Type Selection */}
          <div className="space-y-2">
            <Label>Workflow Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(workflowConfig) as [WorkflowType, typeof config][]).map(([type, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type);
                      setFormData({});
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedType === type
                        ? "border-primary bg-primary/5 ring-2 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`size-8 rounded-md ${cfg.color} flex items-center justify-center`}>
                        <Icon className="size-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{cfg.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {cfg.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Form Fields */}
          <div className="space-y-3 border-t pt-4">
            {config.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === "text" && (
                  <Input
                    id={field.name}
                    value={formData[field.name] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                  />
                )}
                {field.type === "textarea" && (
                  <Textarea
                    id={field.name}
                    value={formData[field.name] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                    rows={3}
                  />
                )}
                {field.type === "select" && (
                  <Select
                    value={formData[field.name] || ""}
                    onValueChange={(value) => setFormData({ ...formData, [field.name]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleLaunch} disabled={isLaunching} className="gap-2">
            {isLaunching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Launch Workflow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Active workflow card with actions
function ActiveWorkflowCard({ 
  execution, 
  onCancel, 
  onRetry,
  onSaveToDocuments,
}: { 
  execution: WorkflowExecution; 
  onCancel?: (id: string) => void;
  onRetry?: (execution: WorkflowExecution) => void;
  onSaveToDocuments?: (execution: WorkflowExecution) => void;
}) {
  const router = useRouter();
  const config = workflowConfig[execution.type];
  const Icon = config.icon;
  const status = statusConfig[execution.status];
  const StatusIcon = status.icon;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (execution.completedAt) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [execution.completedAt]);

  const elapsedTime = execution.completedAt 
    ? ((execution.completedAt - execution.startedAt) / 1000).toFixed(1)
    : ((now - execution.startedAt) / 1000).toFixed(0);

  const handleSaveToDocuments = async () => {
    // Navigate to docs with prefilled content
    const title = `${config.name} - ${new Date(execution.startedAt).toLocaleDateString()}`;
    
    // Format the output properly
    const outputContent = typeof execution.output === "string" 
      ? execution.output 
      : JSON.stringify(execution.output, null, 2);
    
    // Build a well-formatted document
    const documentContent = `# ${title}

## AI Generated Content

${outputContent}

---

## Workflow Details

**Type:** ${config.name}
**Status:** ${execution.status}
**Started:** ${new Date(execution.startedAt).toLocaleString()}
**Completed:** ${execution.completedAt ? new Date(execution.completedAt).toLocaleString() : "N/A"}
**Duration:** ${execution.completedAt ? ((execution.completedAt - execution.startedAt) / 1000).toFixed(1) + "s" : "N/A"}

### Input Parameters
\`\`\`json
${JSON.stringify(execution.input, null, 2)}
\`\`\`

---
*Generated by Nexus AI Agents*`;
    
    // Save via API and redirect
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: documentContent,
        }),
      });
      
      if (res.ok) {
        const doc = await res.json();
        router.push(`/dashboard/docs?id=${doc.id}`);
      }
    } catch (error) {
      console.error("Failed to save to documents:", error);
    }
    
    onSaveToDocuments?.(execution);
  };

  return (
    <Card className={`glass-premium border-white/10 rounded-3xl overflow-hidden transition-all ${execution.status === "running" ? "ring-2 ring-white/20" : ""}`}>
      <CardHeader className="pb-3 p-4 md:p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`size-12 rounded-2xl ${config.color} flex items-center justify-center shadow-lg`}>
              <Icon className="size-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{config.name}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground/80">
                Started {new Date(execution.startedAt).toLocaleTimeString()} • {elapsedTime}s
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`gap-1.5 rounded-full px-2.5 py-0.5 ${status.bg}`}>
              <StatusIcon className={`size-3 ${status.color}`} />
              {status.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-full hover:bg-white/10">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-premium border-white/10">
                <DropdownMenuItem className="gap-2">
                  <Eye className="size-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Copy className="size-4" />
                  Copy ID
                </DropdownMenuItem>
                {execution.status === "completed" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="gap-2 text-green-600"
                      onClick={handleSaveToDocuments}
                    >
                      <FileText className="size-4" />
                      Save to Documents
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {execution.status === "running" && onCancel && (
                  <DropdownMenuItem 
                    className="gap-2 text-red-600"
                    onClick={() => onCancel(execution.id)}
                  >
                    <XCircle className="size-4" />
                    Cancel Workflow
                  </DropdownMenuItem>
                )}
                {(execution.status === "completed" || execution.status === "failed") && onRetry && (
                  <DropdownMenuItem 
                    className="gap-2"
                    onClick={() => onRetry(execution)}
                  >
                    <RefreshCw className="size-4" />
                    Run Again
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 md:p-5 md:pt-0">
        {execution.status === "running" && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{execution.currentStep || "Processing..."}</span>
                <span className="font-medium">{execution.progress}%</span>
              </div>
              <Progress value={execution.progress} className="h-2 rounded-full" />
            </div>
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 text-red-400 hover:text-red-300 rounded-full border-white/20"
                onClick={() => onCancel?.(execution.id)}
              >
                <XCircle className="size-3.5" />
                Cancel
              </Button>
            </div>
          </>
        )}
        {execution.status === "completed" && execution.output && (
          <div className="space-y-3">
            <div className="p-3 bg-green-500/10 rounded-2xl text-sm text-green-400">
              ✓ {execution.output}
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="gap-1.5 rounded-full"
                onClick={handleSaveToDocuments}
              >
                <FileText className="size-3.5" />
                Save to Documents
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 rounded-full border-white/20"
                onClick={() => onRetry?.(execution)}
              >
                <RefreshCw className="size-3.5" />
                Run Again
              </Button>
            </div>
          </div>
        )}
        {execution.status === "failed" && (
          <div className="space-y-3">
            <div className="p-3 bg-red-500/10 rounded-2xl text-sm text-red-400">
              ✗ {execution.error || "An error occurred"}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 rounded-full border-white/20"
              onClick={() => onRetry?.(execution)}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeWorkflows, setActiveWorkflows] = useState<WorkflowExecution[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoadingExecutions, setIsLoadingExecutions] = useState(true);
  const [agentStats, setAgentStats] = useState<Record<string, { tasksCompleted: number; avgResponseTime: string }>>({});
  
  // New state for enhanced functionality
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [filterAgentType, setFilterAgentType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Load active workflows from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nexus-active-workflows");
      if (saved) {
        const parsed = JSON.parse(saved) as WorkflowExecution[];
        // Filter out old workflows (older than 24 hours)
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recent = parsed.filter(w => w.startedAt > dayAgo);
        setActiveWorkflows(recent);
      }
      
      // Also load executions from localStorage
      const savedExecutions = localStorage.getItem("nexus-executions");
      if (savedExecutions) {
        const parsedExecutions = JSON.parse(savedExecutions) as Execution[];
        // Filter out old executions (older than 7 days)
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentExecutions = parsedExecutions.filter(e => (e.startedAt || 0) > weekAgo);
        setExecutions(recentExecutions);
        setIsLoadingExecutions(false);
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
    }
  }, []);

  // Save active workflows to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("nexus-active-workflows", JSON.stringify(activeWorkflows));
    } catch (error) {
      console.error("Failed to save workflows to localStorage:", error);
    }
  }, [activeWorkflows]);

  // Save executions to localStorage whenever they change
  useEffect(() => {
    if (executions.length > 0) {
      try {
        localStorage.setItem("nexus-executions", JSON.stringify(executions));
      } catch (error) {
        console.error("Failed to save executions to localStorage:", error);
      }
    }
  }, [executions]);
  
  // Filtered executions
  const filteredExecutions = useMemo(() => {
    return executions.filter(exec => {
      // Filter by agent type
      if (filterAgentType !== "all" && exec.agentType !== filterAgentType) {
        return false;
      }
      // Filter by status
      if (filterStatus !== "all" && exec.status !== filterStatus) {
        return false;
      }
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const inputStr = typeof exec.input === "object" ? JSON.stringify(exec.input) : String(exec.input);
        const outputStr = typeof exec.output === "object" ? JSON.stringify(exec.output) : String(exec.output);
        return (
          inputStr.toLowerCase().includes(query) ||
          outputStr.toLowerCase().includes(query) ||
          exec.agentType.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [executions, filterAgentType, filterStatus, searchQuery]);
  
  // Handle execution click for detail view
  const handleExecutionClick = useCallback((execution: Execution) => {
    setSelectedExecution(execution);
    setDetailDialogOpen(true);
  }, []);

  // Fetch execution history from API. DB is the source of truth; localStorage is only
  // used for optimistic entries before the API responds.
  useEffect(() => {
    async function fetchExecutions() {
      try {
        const res = await fetch("/api/agents/executions?limit=50");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setExecutions(data);
            setActiveWorkflows(data
              .filter((execution: Execution) => execution.status === "running")
              .map(executionToActiveWorkflow)
            );
            
            // Calculate stats per agent type
            const stats: Record<string, { total: number; completedTime: number; count: number }> = {};
            data.forEach((exec: Execution) => {
              if (!stats[exec.agentType]) {
                stats[exec.agentType] = { total: 0, completedTime: 0, count: 0 };
              }
              if (exec.status === "completed") {
                stats[exec.agentType].total++;
                if (exec.startedAt && exec.completedAt) {
                  stats[exec.agentType].completedTime += (exec.completedAt - exec.startedAt);
                  stats[exec.agentType].count++;
                }
              }
            });
            
            const agentStatsMap: Record<string, { tasksCompleted: number; avgResponseTime: string }> = {};
            Object.entries(stats).forEach(([agentType, stat]) => {
              const avgMs = stat.count > 0 ? stat.completedTime / stat.count : 0;
              agentStatsMap[agentType] = {
                tasksCompleted: stat.total,
                avgResponseTime: avgMs > 0 ? `${(avgMs / 1000).toFixed(1)}s` : "—",
              };
            });
            setAgentStats(agentStatsMap);
          }
        }
      } catch (error) {
        console.error("Failed to fetch executions from API:", error);
        // Keep optimistic localStorage data visible if the API is temporarily unavailable.
      } finally {
        setIsLoadingExecutions(false);
      }
    }

    // Delay fetch to allow localStorage load first
    const timeout = setTimeout(fetchExecutions, 500);
    // Refresh often enough for workflow history to feel live.
    const interval = setInterval(fetchExecutions, 15000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Handle Test Agent button
  const handleTestAgent = useCallback(() => {
    if (selectedAgent) {
      router.push(`/dashboard/chat?agent=${selectedAgent}`);
    }
  }, [selectedAgent, router]);

  // Handle Disable/Enable Agent button
  const handleToggleAgent = useCallback(() => {
    if (selectedAgent) {
      setAgentStatuses((prev) => {
        const currentStatus = prev[selectedAgent] ?? "active";
        const newStatus = currentStatus === "active" ? "disabled" : "active";
        return { ...prev, [selectedAgent]: newStatus };
      });
    }
  }, [selectedAgent]);

  // Get current agent status
  const getAgentStatus = useCallback((agentId: string) => {
    return agentStatuses[agentId] ?? "active";
  }, [agentStatuses]);

  // Launch durable workflows through the production workflow API.
  const launchWorkflow = useCallback(async (type: WorkflowType, input: Record<string, string>) => {
    const executionId = `wf-${Date.now()}`;
    
    // Create new execution
    const newExecution: WorkflowExecution = {
      id: executionId,
      type,
      status: "running",
      input,
      progress: 0,
      currentStep: "Initializing workflow...",
      startedAt: Date.now(),
    };
    
    setActiveWorkflows(prev => [newExecution, ...prev]);

    // Update progress helper
    const updateProgress = (step: string, progress: number) => {
      setActiveWorkflows(prev => 
        prev.map(w => w.id === executionId 
          ? { ...w, currentStep: step, progress } 
          : w
        )
      );
    };

    try {
      updateProgress("Preparing AI request...", 10);

      updateProgress("Starting durable workflow...", 30);

      const apiWorkflowType = type === "task" ? "tasks" : type;
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowType: apiWorkflowType,
          input,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload?.message ||
          payload?.details ||
          payload?.error ||
          `Workflow request failed: ${response.status}`;
        throw new Error(message);
      }

      setActiveWorkflows(prev => 
        prev.map(w => w.id === executionId 
          ? { 
              ...w, 
	              progress: 60,
	              currentStep: "Workflow running in Temporal...",
	              output: `Workflow ${payload?.workflowId ?? executionId} is running. History updates automatically.`,
	            } 
          : w
        )
      );

      // Save to execution history
      const agentTypeMap: Record<WorkflowType, string> = {
        document: "writer",
        research: "researcher",
        task: "project_manager",
        code: "coder",
      };
      
      const newHistoryExecution: Execution = {
        id: payload?.executionId ?? executionId,
        workspaceId: "local",
        agentType: agentTypeMap[type],
        status: "running",
        input,
	        output: {
	          workflowId: payload?.workflowId,
	          executionId: payload?.executionId,
	          type,
	        },
	        error: null,
	        workflowId: payload?.workflowId,
	        startedAt: newExecution.startedAt,
        completedAt: null,
        duration: null,
        createdAt: newExecution.startedAt,
      };
      
      setExecutions(prev => [newHistoryExecution, ...prev]);

    } catch (error) {
      console.error("Workflow error:", error);
      const completedAt = Date.now();
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      
      setActiveWorkflows(prev => 
        prev.map(w => w.id === executionId 
          ? { 
              ...w, 
              status: "failed", 
              progress: 100,
              currentStep: undefined,
              error: errorMessage,
              completedAt,
            } 
          : w
        )
      );

      // Save failed execution to history
      const agentTypeMap: Record<WorkflowType, string> = {
        document: "writer",
        research: "researcher",
        task: "project_manager",
        code: "coder",
      };
      
      const failedExecution: Execution = {
        id: executionId,
        workspaceId: "local",
        agentType: agentTypeMap[type],
        status: "failed",
        input,
        output: { error: errorMessage },
        error: errorMessage,
        startedAt: newExecution.startedAt,
        completedAt,
        duration: `${((completedAt - newExecution.startedAt) / 1000).toFixed(1)}s`,
        createdAt: newExecution.startedAt,
      };
      
      setExecutions(prev => [failedExecution, ...prev]);
    }
  }, []);

  // Cancel a running workflow
  const cancelWorkflow = useCallback((workflowId: string) => {
    setActiveWorkflows(prev => 
      prev.map(w => w.id === workflowId && w.status === "running"
        ? { 
            ...w, 
            status: "failed" as const, 
            error: "Cancelled by user",
            completedAt: Date.now(),
          } 
        : w
      )
    );
  }, []);

  // Retry a failed or completed workflow
  const retryWorkflow = useCallback((execution: WorkflowExecution) => {
    // Remove the old workflow and launch a new one with the same input
    setActiveWorkflows(prev => prev.filter(w => w.id !== execution.id));
    launchWorkflow(execution.type, execution.input as Record<string, string>);
  }, [launchWorkflow]);

  // Clear completed/failed workflows
  const clearCompletedWorkflows = useCallback(() => {
    setActiveWorkflows(prev => prev.filter(w => w.status === "running" || w.status === "pending"));
  }, []);

  return (
    <div className="relative min-h-screen pb-32">
      {/* Premium Animated Background */}
      <PremiumBackground colorScheme="violet-emerald" blobCount={3} />

      {/* Content Layer */}
      <div className="relative z-10 px-4 md:px-6 lg:px-8">
        {/* Premium Hero Header */}
        <PremiumHeroHeader
          label="AI WORKSPACE"
          title="AI Agents"
          description={
            <>
              <span className="text-white/70">{AGENT_TYPES.length}</span> agent types available
              <span className="mx-2 text-white/20">•</span>
              <span className="text-white/70">{activeWorkflows.filter(w => w.status === "running").length}</span> workflows running
            </>
          }
          action={
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border-white/20">
                <Activity className="size-3 text-emerald-400" />
                <span className="text-white/70">System Healthy</span>
              </Badge>
              <WorkflowLauncher onLaunch={launchWorkflow} />
            </div>
          }
        />

        {/* Metrics Dashboard */}
        <section className="mb-8">
          <MetricsDashboard executions={executions} />
        </section>

        {/* Content */}
        <section>
          <Tabs defaultValue="agents" className="space-y-6">
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex h-auto bg-white/[0.03] backdrop-blur-xl rounded-full p-1 border border-white/[0.08]">
              <TabsTrigger value="agents" className="text-xs sm:text-sm px-4 py-2 rounded-full data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60">Agents</TabsTrigger>
              <TabsTrigger value="workflows" className="text-xs sm:text-sm px-4 py-2 rounded-full data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60">
                <span className="hidden sm:inline">Active </span>Workflows
                {activeWorkflows.filter(w => w.status === "running").length > 0 && (
                  <Badge variant="secondary" className="ml-2 size-5 p-0 justify-center text-xs rounded-full bg-violet-500/20 text-violet-400">
                    {activeWorkflows.filter(w => w.status === "running").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="executions" className="text-xs sm:text-sm px-4 py-2 rounded-full data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60">History</TabsTrigger>
            </TabsList>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6 mt-4 md:mt-6">
            <AnimatePresence mode="popLayout">
              <div className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {AGENT_TYPES.map((agent, index) => {
                  const Icon = agent.icon;
                  const status = getAgentStatus(agent.id);
                  const stats = agentStats[agent.id] || { tasksCompleted: 0, avgResponseTime: "—" };
                  const isSelected = selectedAgent === agent.id;
                  
                  return (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ 
                        delay: 0.3 + index * 0.05,
                        type: 'spring',
                        stiffness: 150,
                        damping: 20,
                      }}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={`cursor-pointer relative group rounded-3xl overflow-hidden bg-white/[0.02] backdrop-blur-md border transition-all duration-300 ${
                        isSelected 
                          ? "ring-2 ring-white/30 border-white/20 bg-white/[0.05]" 
                          : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Hover glow effect */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isSelected ? 0.5 : 0 }}
                        whileHover={{ opacity: 0.3 }}
                        className="absolute inset-0 -z-10 blur-2xl bg-white/10 transition-opacity duration-500"
                      />

                      {/* Gradient border on hover */}
                      <div
                        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"
                      />

                      <div className="p-4 md:p-6 pb-3 md:pb-3">
                        <div className="flex items-start justify-between">
                          <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            transition={{ type: 'spring', stiffness: 300 }}
                            className={`size-12 md:size-14 rounded-2xl ${agent.color} flex items-center justify-center shadow-lg`}
                          >
                            <Icon className="size-6 md:size-7 text-white" />
                          </motion.div>
                          <Badge
                            variant={status === "active" ? "default" : "secondary"}
                            className={`gap-1.5 text-xs rounded-full px-3 py-1 ${
                              status === "active" 
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                                : "bg-white/5 text-white/50 border-white/10"
                            }`}
                          >
                            <div
                              className={`size-2 rounded-full ${
                                status === "active"
                                  ? "bg-emerald-400 animate-pulse"
                                  : "bg-white/30"
                              }`}
                            />
                            {status}
                          </Badge>
                        </div>
                        <h3 className="mt-4 text-base md:text-lg font-semibold text-white">{agent.name}</h3>
                        <p className="text-xs md:text-sm text-white/50 mt-1 line-clamp-2 min-h-[2.5rem]">{agent.description}</p>
                      </div>
                      <div className="p-4 pt-0 md:p-6 md:pt-0">
                        <div className="flex items-center justify-between text-xs md:text-sm pt-3 border-t border-white/5">
                          <div className="flex items-center gap-1.5 text-white/40">
                            <CheckCircle2 className="size-3.5 md:size-4 text-white/40" />
                            <span>{stats.tasksCompleted} tasks</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-white/40">
                            <Zap className="size-3.5 md:size-4 text-white/40" />
                            <span>{stats.avgResponseTime === "—" ? "—" : `${stats.avgResponseTime} avg`}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>

            {/* Agent Details */}
            {selectedAgent && (() => {
              const agent = AGENT_TYPES.find((a) => a.id === selectedAgent);
              if (!agent) return null;
              
              return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="glass-premium border-white/10 rounded-3xl overflow-hidden">
                  <CardHeader className="p-5 md:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`size-14 rounded-2xl ${agent.color} flex items-center justify-center shadow-lg`}>
                          <agent.icon className="size-7 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg md:text-xl font-semibold">
                            {agent.name} Configuration
                          </CardTitle>
                          <CardDescription className="text-sm text-muted-foreground/80">
                            {agent.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="gap-1.5 text-xs shrink-0 rounded-full px-3 py-1.5 border-white/20">
                        <Cpu className="size-3" />
                        {agent.model}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 p-5 pt-0 md:p-8 md:pt-0">
                    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2 text-sm md:text-base">
                          <Layers className="size-4 text-muted-foreground" />
                          Capabilities
                        </h4>
                        <div className="flex gap-2 flex-wrap">
                          {agent.capabilities.map((cap) => (
                            <Badge key={cap} variant="outline" className="gap-1.5 text-xs rounded-full px-3 py-1 border-white/10 bg-white/5">
                              <Sparkles className="size-3" />
                              {cap}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2 text-sm md:text-base">
                          <Settings className="size-4 text-muted-foreground" />
                          Actions
                        </h4>
                        <div className="flex gap-2 flex-wrap">
                          <Button 
                            size="sm" 
                            className="gap-1.5 text-xs rounded-full"
                            onClick={handleTestAgent}
                          >
                            <MessageSquare className="size-3.5" />
                            <span className="hidden xs:inline">Chat with</span> Agent
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="gap-1.5 text-xs rounded-full border-white/20"
                            onClick={handleToggleAgent}
                          >
                            {getAgentStatus(selectedAgent) === "active" ? (
                              <>
                                <Pause className="size-3.5" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Play className="size-3.5" />
                                Enable
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Agent Statistics */}
                    <div className="border-t border-white/10 pt-6">
                      <h4 className="font-medium mb-4 flex items-center gap-2">
                        <TrendingUp className="size-4 text-muted-foreground" />
                        Performance Statistics
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="text-3xl font-bold tracking-tight">
                            {agentStats[selectedAgent]?.tasksCompleted || 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Tasks Completed</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="text-3xl font-bold tracking-tight">
                            {agentStats[selectedAgent]?.avgResponseTime || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Avg Response</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="text-3xl font-bold tracking-tight text-green-400">
                            {executions.filter(e => e.agentType === selectedAgent && e.status === "completed").length > 0
                            ? `${Math.round((executions.filter(e => e.agentType === selectedAgent && e.status === "completed").length / executions.filter(e => e.agentType === selectedAgent).length) * 100)}%`
                            : "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Success Rate</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </motion.div>
              );
            })()}
          </TabsContent>

          {/* Active Workflows Tab */}
          <TabsContent value="workflows" className="space-y-4 mt-4">
            {activeWorkflows.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <Badge variant="outline" className="gap-1.5 text-xs rounded-full px-3 py-1 border-white/20">
                    <Activity className="size-3 text-blue-400" />
                    {activeWorkflows.filter(w => w.status === "running").length} Running
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 text-xs text-green-400 rounded-full px-3 py-1 border-white/20">
                    <CheckCircle2 className="size-3" />
                    {activeWorkflows.filter(w => w.status === "completed").length} Completed
                  </Badge>
                  {activeWorkflows.filter(w => w.status === "failed").length > 0 && (
                    <Badge variant="outline" className="gap-1.5 text-xs text-red-400 rounded-full px-3 py-1 border-white/20">
                      <XCircle className="size-3" />
                      {activeWorkflows.filter(w => w.status === "failed").length} Failed
                    </Badge>
                  )}
                </div>
                {activeWorkflows.some(w => w.status !== "running" && w.status !== "pending") && (
                  <Button variant="outline" size="sm" onClick={clearCompletedWorkflows} className="gap-1.5 text-xs rounded-full border-white/20">
                    <Trash2 className="size-3.5" />
                    <span className="hidden sm:inline">Clear</span> Completed
                  </Button>
                )}
              </div>
            )}
            
            {activeWorkflows.length === 0 ? (
              <Card className="border-dashed glass-premium border-white/10 rounded-3xl">
                <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
                  <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                    <Rocket className="size-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg md:text-xl font-medium mb-2">No Active Workflows</h3>
                  <p className="text-sm text-muted-foreground mb-6 text-center px-4 max-w-md">
                    Launch a workflow to get started with AI-powered automation
                  </p>
                  <WorkflowLauncher onLaunch={launchWorkflow} />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2">
                {activeWorkflows.map((execution) => (
                  <ActiveWorkflowCard 
                    key={execution.id} 
                    execution={execution}
                    onCancel={cancelWorkflow}
                    onRetry={retryWorkflow}
                    onSaveToDocuments={() => {
                      // Remove from active after saving
                      setActiveWorkflows(prev => prev.filter(w => w.id !== execution.id));
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Executions Tab */}
          <TabsContent value="executions" className="mt-4">
            <Card className="glass-premium border-white/10 rounded-3xl overflow-hidden">
              <CardHeader className="p-5 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg md:text-xl font-semibold">Execution History</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground/80 mt-1">
                      View and filter agent execution history • {filteredExecutions.length} of {executions.length} executions
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Export button */}
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-full border-white/20">
                      <FileText className="size-3.5" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5 pt-0 md:p-8 md:pt-0">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search executions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 text-sm rounded-full bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-1.5 text-xs md:text-sm flex-1 sm:flex-none rounded-full border-white/20">
                        <Filter className="size-3.5" />
                        <span className="truncate">{filterAgentType === "all" ? "All" : AGENT_TYPES.find(a => a.id === filterAgentType)?.name}</span>
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="glass-premium border-white/10">
                      <DropdownMenuItem onClick={() => setFilterAgentType("all")}>
                        All Agents
                      </DropdownMenuItem>
                      {AGENT_TYPES.map(agent => (
                        <DropdownMenuItem key={agent.id} onClick={() => setFilterAgentType(agent.id)}>
                          <agent.icon className="size-4 mr-2" />
                          {agent.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-1.5 text-xs md:text-sm flex-1 sm:flex-none rounded-full border-white/20">
                        <span className="truncate">{filterStatus === "all" ? "All Status" : filterStatus}</span>
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="glass-premium border-white/10">
                      <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                        All Statuses
                      </DropdownMenuItem>
                      {Object.entries(statusConfig).map(([key, config]) => (
                        <DropdownMenuItem key={key} onClick={() => setFilterStatus(key)}>
                          <config.icon className={`size-4 mr-2 ${config.color}`} />
                          {config.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                  {(filterAgentType !== "all" || filterStatus !== "all" || searchQuery) && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-xs w-full sm:w-auto rounded-full"
                      onClick={() => {
                        setFilterAgentType("all");
                        setFilterStatus("all");
                        setSearchQuery("");
                      }}
                    >
                      <RotateCcw className="size-3.5 mr-1.5" />
                      Clear Filters
                    </Button>
                  )}
                </div>

                {isLoadingExecutions ? (
                  <div className="flex items-center justify-center py-12 md:py-16">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredExecutions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 md:py-16">
                    <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                      <Clock className="size-8 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg md:text-xl font-medium mb-2">
                      {executions.length === 0 ? "No Executions Yet" : "No Matching Executions"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center px-4 max-w-md">
                      {executions.length === 0 
                        ? "Agent executions will appear here once you start using them"
                        : "Try adjusting your filters to see more results"}
                    </p>
                  </div>
                ) : (
                <ScrollArea className="h-[400px] md:h-[500px]">
                  <div className="space-y-3">
                    {filteredExecutions.map((exec) => {
                      const agent = AGENT_TYPES.find((a) => a.id === exec.agentType);
                      const status = statusConfig[exec.status as keyof typeof statusConfig] || statusConfig.pending;
                      const StatusIcon = status.icon;
                      const inputText = formatExecutionPreview(exec.input);
                      const outputText = formatExecutionPreview(exec.output);

                      return (
                        <div
                          key={exec.id}
                          className="flex items-start gap-4 p-4 md:p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 cursor-pointer transition-all"
                          onClick={() => handleExecutionClick(exec)}
                        >
                          <div
                            className={`size-10 md:size-12 rounded-2xl ${agent?.color || "bg-gray-500"} flex items-center justify-center shrink-0 shadow-lg`}
                          >
                            {agent && <agent.icon className="size-5 md:size-6 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="font-medium text-sm md:text-base">{agent?.name || exec.agentType}</span>
                              <Badge
                                variant="secondary"
                                className={`gap-1.5 text-xs rounded-full px-2 py-0.5 ${status.bg}`}
                              >
                                <StatusIcon className={`size-3 ${status.color}`} />
                                <span className="hidden xs:inline">{status.label}</span>
                              </Badge>
                              {exec.duration && (
                                <span className="text-xs text-muted-foreground">
                                  {exec.duration}
                                </span>
                              )}
                            </div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-2 truncate">
                              {inputText}
                            </p>
                            {outputText && (
                              <p className="text-xs md:text-sm text-green-400 bg-green-500/10 rounded-lg px-3 py-1.5 truncate">
                                ✓ {outputText}
                              </p>
                            )}
                            {exec.error && (
                              <p className="text-xs md:text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-1.5">
                                ✗ {exec.error}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 hidden sm:block">
                            <span className="text-xs text-muted-foreground block">
                              {exec.startedAt ? new Date(exec.startedAt).toLocaleTimeString() : "-"}
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              {exec.startedAt ? new Date(exec.startedAt).toLocaleDateString() : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </section>
      </div>

      {/* Execution Detail Dialog */}
      {selectedExecution && (
        <ExecutionDetailDialog
          execution={selectedExecution}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
        />
      )}
    </div>
  );
}
