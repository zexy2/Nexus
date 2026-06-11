"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  MoreHorizontal,
  Bot,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Pause,
  MessageSquare,
  Sparkles,
  AlertCircle,
  Link as LinkIcon,
  Trash2,
  Plus,
  Save,
} from "lucide-react";
import Link from "next/link";

type TaskStatus = "todo" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeAgentType: string | null;
  dueDate: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface AgentActivity {
  timestamp: number;
  action: string;
  details: string;
  result?: string; // Agent work result/output
  sources?: Array<{ title: string; url: string; snippet?: string }>; // Research sources
}

interface ResearchSource {
  number: number;
  title: string;
  url: string;
  snippet?: string;
}

const statusConfig = {
  todo: { label: "To Do", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-blue-500" },
  review: { label: "Review", icon: Clock, color: "text-yellow-500" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-500" },
};

const priorityConfig = {
  low: { label: "Low", color: "bg-gray-500" },
  medium: { label: "Medium", color: "bg-yellow-500" },
  high: { label: "High", color: "bg-orange-500" },
  urgent: { label: "Urgent", color: "bg-red-500" },
};

const agentNames: Record<string, string> = {
  supervisor: "Supervisor Agent",
  writer: "Writer Agent",
  researcher: "Research Agent",
  coder: "Code Agent",
  designer: "Design Agent",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentPhase, setAgentPhase] = useState<string>("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([]);
  const [finalReport, setFinalReport] = useState<string>("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [researchStats, setResearchStats] = useState<{
    totalDuration?: number;
    searchQueries?: number;
    sourcesFound?: number;
  }>({});
  
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  
  // Agent work simulation - starts automatically for AI-assigned tasks
  const startAgentWork = async () => {
    if (!task?.assigneeAgentType) {
      alert("Bu task'a bir AI Agent atanmamış");
      return;
    }
    if (!description.trim()) {
      alert("Lütfen önce bir açıklama girin");
      return;
    }
    
    setIsAgentRunning(true);
    setAgentPhase("Analyzing task...");
    
    // Add activity
    setAgentActivity(prev => [{
      timestamp: Date.now(),
      action: "Agent started working",
      details: `${agentNames[task.assigneeAgentType!]} is analyzing the task`,
    }, ...prev]);
    
    await new Promise(r => setTimeout(r, 1500));
    
    // Phase 1: Create subtasks if none exist
    if (subtasks.length === 0) {
      setAgentPhase("Breaking down into subtasks...");
      
      let newSubtasks: Subtask[] = [];
      
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `You are a ${agentNames[task.assigneeAgentType!]}. Break down this task into 4-6 actionable subtasks in Turkish.

Task: "${title}"
Description: "${description}"
Priority: ${task.priority}

IMPORTANT: Return ONLY a valid JSON array of subtask titles. No markdown, no explanation.
Example: ["Araştırma yap", "Taslak hazırla", "İncele"]`
            }],
          }),
        });
        
        if (res.ok) {
          const responseText = await res.text();
          console.log("Agent AI Response:", responseText);
          
          const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const subtaskTitles = JSON.parse(jsonMatch[0].replace(/```json/g, "").replace(/```/g, ""));
            if (Array.isArray(subtaskTitles) && subtaskTitles.length > 0) {
              newSubtasks = subtaskTitles.map((t: string, i: number) => ({
                id: `agent-${Date.now()}-${i}`,
                title: typeof t === "string" ? t.trim() : String(t).trim(),
                completed: false,
              }));
            }
          }
        }
      } catch (error) {
        console.error("Agent AI error:", error);
      }
      
      // Fallback to default subtasks if AI failed
      if (newSubtasks.length === 0) {
        newSubtasks = [
          { id: `agent-${Date.now()}-0`, title: `${title} için araştırma yap`, completed: false },
          { id: `agent-${Date.now()}-1`, title: "Gerekli bilgileri topla", completed: false },
          { id: `agent-${Date.now()}-2`, title: "Ana içeriği hazırla", completed: false },
          { id: `agent-${Date.now()}-3`, title: "Sonuçları gözden geçir", completed: false },
        ];
      }
      
      setSubtasks(newSubtasks);
      
      setAgentActivity(prev => [{
        timestamp: Date.now(),
        action: "Created subtasks",
        details: `Broke down task into ${newSubtasks.length} actionable items`,
      }, ...prev]);
      
      // Phase 2: Work on subtasks one by one with actual AI research
      await new Promise(r => setTimeout(r, 1000));
      
      for (let i = 0; i < newSubtasks.length; i++) {
        const subtaskTitle = newSubtasks[i].title;
        setAgentPhase(`Working on: ${subtaskTitle}`);
        
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: `Started: ${subtaskTitle}`,
          details: "Researching...",
        }, ...prev]);
        
        // Actually do AI research for this subtask
        let researchResult = "";
        try {
          const researchRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{
                role: "user",
                content: `You are a ${agentNames[task.assigneeAgentType!]}. 
                
Main Task: "${title}"
Current Subtask: "${subtaskTitle}"

Please complete this subtask. Provide a brief but informative result in Turkish (2-3 sentences max).`
              }],
            }),
          });
          
          if (researchRes.ok) {
            researchResult = await researchRes.text();
            // Clean up result
            researchResult = researchResult.slice(0, 300); // Limit length
          }
        } catch {
          researchResult = `${subtaskTitle} tamamlandı.`;
        }
        
        // If no result, use default
        if (!researchResult.trim()) {
          researchResult = `${subtaskTitle} başarıyla tamamlandı.`;
        }
        
        // Mark subtask as complete
        setSubtasks(prev => prev.map((s, idx) => 
          idx === i ? { ...s, completed: true } : s
        ));
        
        // Add completion activity with result
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: `Completed: ${subtaskTitle}`,
          details: "✓ Done",
          result: researchResult,
        }, ...prev]);
      }
    } else {
      // Work on existing incomplete subtasks
      const incompleteSubtasks = subtasks.filter(s => !s.completed);
      
      for (const subtask of incompleteSubtasks) {
        setAgentPhase(`Working on: ${subtask.title}`);
        
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: `Started: ${subtask.title}`,
          details: "Researching...",
        }, ...prev]);
        
        // Do AI research
        let researchResult = "";
        try {
          const researchRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{
                role: "user",
                content: `You are completing a subtask. 
Task: "${title}"
Subtask: "${subtask.title}"

Provide a brief result in Turkish (2-3 sentences).`
              }],
            }),
          });
          
          if (researchRes.ok) {
            researchResult = await researchRes.text();
            researchResult = researchResult.slice(0, 300);
          }
        } catch {
          researchResult = `${subtask.title} tamamlandı.`;
        }
        
        if (!researchResult.trim()) {
          researchResult = `${subtask.title} başarıyla tamamlandı.`;
        }
        
        setSubtasks(prev => prev.map(s => 
          s.id === subtask.id ? { ...s, completed: true } : s
        ));
        
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: `Completed: ${subtask.title}`,
          details: "✓ Done",
          result: researchResult,
        }, ...prev]);
      }
    }
    
    // All done - Generate Final Report
    setAgentPhase("Generating final report...");
    setGeneratingReport(true);
    
    // Collect all results from activities
    const allResults = agentActivity
      .filter(a => a.result)
      .map(a => `- ${a.action}: ${a.result}`)
      .reverse() // Chronological order
      .join("\n");
    
    try {
      const reportRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `You are a ${agentNames[task.assigneeAgentType!]}. You have completed all subtasks for the following task.

Task: "${title}"
Description: "${description}"

Subtask Results:
${allResults}

Now write a comprehensive FINAL REPORT in Turkish that:
1. Summarizes all findings
2. Provides key insights
3. Gives actionable conclusions

Format it nicely with sections. Keep it concise but informative (max 500 words).`
          }],
        }),
      });
      
      if (reportRes.ok) {
        const report = await reportRes.text();
        setFinalReport(report);
        localStorage.setItem(`task-${taskId}-report`, report);
        
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: "📋 Final Report Generated",
          details: "All research compiled into a comprehensive report",
          result: report,
        }, ...prev]);
      }
    } catch (error) {
      console.error("Failed to generate report:", error);
    }
    
    setGeneratingReport(false);
    setAgentPhase("");
    setIsAgentRunning(false);
    
    // Update task status to done
    if (task.status !== "done") {
      await handleStatusChange("done");
      setAgentActivity(prev => [{
        timestamp: Date.now(),
        action: "✅ Task completed",
        details: "All subtasks finished, final report generated",
      }, ...prev]);
    }
  };
  
  const toggleAgentRunning = () => {
    if (isAgentRunning) {
      setIsAgentRunning(false);
      setAgentPhase("");
      setAgentActivity(prev => [{
        timestamp: Date.now(),
        action: "Agent paused",
        details: "Work suspended by user",
      }, ...prev]);
    } else {
      startAgentWork();
    }
  };

  // Deep Research - Uses Tavily for real web research like Tavily Pro
  const startDeepResearch = async () => {
    if (!description.trim()) {
      alert("Lütfen önce bir açıklama girin");
      return;
    }
    
    setIsAgentRunning(true);
    setGeneratingReport(true);
    setResearchSources([]);
    setResearchStats({});
    
    const startTime = Date.now();
    
    setAgentActivity(prev => [{
      timestamp: Date.now(),
      action: "🔬 Deep Research Started",
      details: "Initializing comprehensive web research...",
    }, ...prev]);
    
    try {
      const response = await fetch("/api/research/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${title}: ${description}`,
          topic: title,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Deep research API error");
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const { event, data } = JSON.parse(line.slice(6));
                
                if (event === "phase") {
                  const duration = data.duration ? `(${(data.duration / 1000).toFixed(1)}s)` : "";
                  setAgentPhase(`${data.phase}: ${data.message} ${duration}`);
                  
                  if (data.status === "completed") {
                    setAgentActivity(prev => [{
                      timestamp: Date.now(),
                      action: `✓ ${data.phase.charAt(0).toUpperCase() + data.phase.slice(1)}`,
                      details: data.message,
                    }, ...prev]);
                  }
                  
                  if (data.queries) {
                    setAgentActivity(prev => [{
                      timestamp: Date.now(),
                      action: "📝 Research Queries",
                      details: `Generated ${data.queries.length} search queries`,
                      result: data.queries.join("\n"),
                    }, ...prev]);
                  }
                }
                
                if (event === "search_progress") {
                  setAgentPhase(`Searching: ${data.query} (${data.current}/${data.total})`);
                }
                
                if (event === "complete") {
                  // Set final report
                  setFinalReport(data.report);
                  localStorage.setItem(`task-${taskId}-report`, data.report);
                  
                  // Set sources
                  setResearchSources(data.sources || []);
                  localStorage.setItem(`task-${taskId}-sources`, JSON.stringify(data.sources || []));
                  
                  // Set stats
                  setResearchStats(data.stats || {});
                  
                  // Add final activity
                  setAgentActivity(prev => [{
                    timestamp: Date.now(),
                    action: "📋 Deep Research Complete",
                    details: `${data.stats?.sourcesUsed || 0} sources analyzed in ${((data.stats?.totalDuration || 0) / 1000).toFixed(1)}s`,
                    result: data.report,
                    sources: data.sources,
                  }, ...prev]);
                }
                
                if (event === "error") {
                  throw new Error(data.message);
                }
              } catch {
                // Skip parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Deep research error:", error);
      setAgentActivity(prev => [{
        timestamp: Date.now(),
        action: "❌ Research Failed",
        details: String(error),
      }, ...prev]);
    } finally {
      setGeneratingReport(false);
      setAgentPhase("");
      setIsAgentRunning(false);
      
      // Update task status
      if (task && task.status !== "done") {
        await handleStatusChange("done");
      }
    }
  };

  // Fetch task data
  useEffect(() => {
    async function fetchTask() {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (res.ok) {
          const data = await res.json();
          setTask(data);
          setTitle(data.title);
          setDescription(data.description || "");
          
          // Load subtasks from localStorage
          const savedSubtasks = localStorage.getItem(`task-${taskId}-subtasks`);
          if (savedSubtasks) {
            setSubtasks(JSON.parse(savedSubtasks));
          }
          
          // Load final report from localStorage
          const savedReport = localStorage.getItem(`task-${taskId}-report`);
          if (savedReport) {
            setFinalReport(savedReport);
          }
          
          // Load research sources from localStorage
          const savedSources = localStorage.getItem(`task-${taskId}-sources`);
          if (savedSources) {
            setResearchSources(JSON.parse(savedSources));
          }
          
          // Load agent activity from localStorage
          const savedActivity = localStorage.getItem(`task-${taskId}-activity`);
          if (savedActivity) {
            setAgentActivity(JSON.parse(savedActivity));
          } else if (data.assigneeAgentType) {
            // Only generate default activity if nothing saved
            setAgentActivity([
              {
                timestamp: new Date(data.updatedAt).getTime(),
                action: "Task status updated",
                details: `Current status: ${statusConfig[data.status as TaskStatus]?.label || data.status}`,
              },
              {
                timestamp: new Date(data.createdAt).getTime(),
                action: `Task assigned to ${agentNames[data.assigneeAgentType] || "AI Agent"}`,
                details: `Priority set to ${data.priority}`,
              },
            ]);
          }
        } else {
          router.push("/dashboard/tasks");
        }
      } catch (error) {
        console.error("Failed to fetch task:", error);
        router.push("/dashboard/tasks");
      } finally {
        setLoading(false);
      }
    }
    
    if (taskId) {
      fetchTask();
    }
  }, [taskId, router]);

  // Track changes
  useEffect(() => {
    if (task) {
      setHasChanges(title !== task.title || description !== (task.description || ""));
    }
  }, [title, description, task]);

  // Save subtasks to localStorage
  useEffect(() => {
    if (taskId && subtasks.length > 0) {
      localStorage.setItem(`task-${taskId}-subtasks`, JSON.stringify(subtasks));
    }
  }, [subtasks, taskId]);

  // Save agent activity to localStorage
  useEffect(() => {
    if (taskId && agentActivity.length > 0) {
      localStorage.setItem(`task-${taskId}-activity`, JSON.stringify(agentActivity));
    }
  }, [agentActivity, taskId]);

  const handleSave = async () => {
    if (!task || !hasChanges) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      
      if (res.ok) {
        const updated = await res.json();
        setTask(updated);
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save task:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: TaskStatus) => {
    if (!task) return;
    
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      
      if (res.ok) {
        const updated = await res.json();
        setTask(updated);
        
        // Add activity
        setAgentActivity(prev => [{
          timestamp: Date.now(),
          action: `Status changed to ${statusConfig[status].label}`,
          details: "Manual update",
        }, ...prev]);
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handlePriorityChange = async (priority: TaskPriority) => {
    if (!task) return;
    
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      
      if (res.ok) {
        const updated = await res.json();
        setTask(updated);
      }
    } catch (error) {
      console.error("Failed to update priority:", error);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        localStorage.removeItem(`task-${taskId}-subtasks`);
        router.push("/dashboard/tasks");
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
    } finally {
      setDeleting(false);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks(prev => [...prev, { 
      id: `subtask-${Date.now()}`, 
      title: newSubtask, 
      completed: false 
    }]);
    setNewSubtask("");
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(prev => prev.map(s => 
      s.id === id ? { ...s, completed: !s.completed } : s
    ));
  };

  const breakdownWithAI = async () => {
    if (!description.trim()) {
      alert("Lütfen önce bir açıklama girin");
      return;
    }
    
    setBreakdownLoading(true);
    
    try {
      // Use chat API for simpler response handling
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Break down this task into 3-6 actionable subtasks in Turkish.

Task: "${title}"
Description: "${description}"

IMPORTANT: Return ONLY a valid JSON array with subtask titles. No markdown, no explanation.
Example format: ["Araştırma yap", "Taslak hazırla", "İncele ve düzenle"]`
          }],
        }),
      });
      
      if (res.ok) {
        // Get response as text first
        const responseText = await res.text();
        console.log("AI Response:", responseText);
        
        // Extract JSON array from response
        const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          try {
            // Clean the JSON string
            const cleanJson = jsonMatch[0]
              .replace(/```json/g, "")
              .replace(/```/g, "")
              .trim();
            
            const subtaskTitles = JSON.parse(cleanJson);
            if (Array.isArray(subtaskTitles) && subtaskTitles.length > 0) {
              const newSubtasks = subtaskTitles.map((t: string, i: number) => ({
                id: `ai-${Date.now()}-${i}`,
                title: typeof t === "string" ? t.trim() : String(t).trim(),
                completed: false,
              }));
              setSubtasks(prev => [...prev, ...newSubtasks]);
              
              // Add activity
              setAgentActivity(prev => [{
                timestamp: Date.now(),
                action: "AI broke down task into subtasks",
                details: `Created ${newSubtasks.length} subtasks`,
              }, ...prev]);
            } else {
              throw new Error("Empty array");
            }
          } catch (e) {
            console.error("Failed to parse AI subtasks:", e, "Raw:", responseText);
            // Fallback: create default subtasks
            createDefaultSubtasks();
          }
        } else {
          console.error("No JSON array found in response:", responseText);
          createDefaultSubtasks();
        }
      } else {
        console.error("API error:", res.status);
        createDefaultSubtasks();
      }
    } catch (error) {
      console.error("Error breaking down task:", error);
      createDefaultSubtasks();
    } finally {
      setBreakdownLoading(false);
    }
  };
  
  const createDefaultSubtasks = () => {
    // Create intelligent default subtasks based on task description
    const defaultSubtasks = [
      { id: `ai-${Date.now()}-0`, title: `${title} için araştırma yap`, completed: false },
      { id: `ai-${Date.now()}-1`, title: "Gerekli kaynakları topla", completed: false },
      { id: `ai-${Date.now()}-2`, title: "Taslak oluştur", completed: false },
      { id: `ai-${Date.now()}-3`, title: "İncele ve düzenle", completed: false },
      { id: `ai-${Date.now()}-4`, title: "Sonuçları derle", completed: false },
    ];
    
    setSubtasks(prev => [...prev, ...defaultSubtasks]);
    setAgentActivity(prev => [{
      timestamp: Date.now(),
      action: "Created default subtasks",
      details: "Used template since AI was unavailable",
    }, ...prev]);
  };

  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const progress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <SidebarTrigger />
        <Link href="/dashboard/tasks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1 flex items-center gap-3">
          <Badge
            variant="outline"
            className={`${statusConfig[task.status as TaskStatus]?.color || ""}`}
          >
            {task.status === "in_progress" ? (
              <Loader2 className="size-3 mr-1 animate-spin" />
            ) : null}
            {statusConfig[task.status as TaskStatus]?.label || task.status}
          </Badge>
          <div className={`size-2 rounded-full ${priorityConfig[task.priority as TaskPriority]?.color || "bg-gray-500"}`} />
          <span className="text-sm font-medium">{priorityConfig[task.priority as TaskPriority]?.label || task.priority}</span>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1"
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              Save Changes
            </Button>
          )}
          
          {task.assigneeAgentType && (
            <Button
              variant={isAgentRunning ? "secondary" : "default"}
              size="sm"
              className="gap-1"
              onClick={toggleAgentRunning}
            >
              {isAgentRunning ? (
                <>
                  <Pause className="size-3" />
                  Pause Agent
                </>
              ) : (
                <>
                  <Play className="size-3" />
                  Start Agent
                </>
              )}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(window.location.href)}>
                <LinkIcon className="size-4 mr-2" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4 mr-2" />
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          <div className="grid grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="col-span-2 space-y-6">
              {/* Title */}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
                placeholder="Task title"
              />

              {/* Description */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px] resize-none"
                  placeholder="Add a description..."
                />
              </div>

              {/* Subtasks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Subtasks ({completedSubtasks}/{subtasks.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <Progress value={progress} className="w-32" />
                    {description && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={breakdownWithAI}
                        disabled={breakdownLoading}
                        className="gap-1"
                      >
                        {breakdownLoading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3 text-purple-500" />
                        )}
                        AI Breakdown
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Add subtask */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a subtask..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                  />
                  <Button onClick={addSubtask} size="icon" variant="secondary">
                    <Plus className="size-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <button onClick={() => toggleSubtask(subtask.id)}>
                        {subtask.completed ? (
                          <CheckCircle2 className="size-5 text-green-500" />
                        ) : (
                          <Circle className="size-5 text-muted-foreground" />
                        )}
                      </button>
                      <span className={subtask.completed ? "line-through text-muted-foreground" : ""}>
                        {subtask.title}
                      </span>
                    </div>
                  ))}
                  {subtasks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No subtasks yet. Add one above or use AI Breakdown.
                    </p>
                  )}
                </div>
              </div>

              {/* Final Report */}
              {(finalReport || generatingReport) && (
                <div id="final-report" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Sparkles className="size-4 text-purple-500" />
                      📋 Final Report
                    </h3>
                    {finalReport && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(finalReport);
                            alert("Report copied to clipboard!");
                          }}
                          className="text-xs"
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            localStorage.removeItem(`task-${taskId}-report`);
                            setFinalReport("");
                          }}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
                    {generatingReport ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary">
                          <Loader2 className="size-4 animate-spin" />
                          <span>Performing deep research...</span>
                        </div>
                        {agentPhase && (
                          <p className="text-xs text-muted-foreground ml-6">{agentPhase}</p>
                        )}
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-ul:text-foreground/90 prose-li:marker:text-primary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {finalReport}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  
                  {/* Research Sources */}
                  {researchSources.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <LinkIcon className="size-4" />
                        Sources ({researchSources.length})
                      </h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {researchSources.map((source, i) => (
                          <a
                            key={i}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-bold text-primary">[{source.number}]</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{source.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                                {source.snippet && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{source.snippet}</p>
                                )}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                      {researchStats.totalDuration && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          🔬 Deep research completed in {(researchStats.totalDuration / 1000).toFixed(1)}s 
                          • {researchStats.searchQueries} queries 
                          • {researchStats.sourcesFound} sources found
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Agent Activity */}
              {task.assigneeAgentType && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Bot className="size-4" />
                      Agent Activity
                    </h3>
                    {agentActivity.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          localStorage.removeItem(`task-${taskId}-activity`);
                          setAgentActivity([]);
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Clear History
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {agentActivity.map((activity, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 p-3 rounded-lg border ${activity.result ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}
                      >
                        <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${activity.result ? 'bg-primary/20' : 'bg-primary/10'}`}>
                          <Bot className="size-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{activity.action}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(activity.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {activity.details}
                          </p>
                          {activity.result && (
                            <div className="mt-2 p-2 rounded bg-background border text-sm">
                              <p className="text-xs font-medium text-primary mb-1">📝 Result:</p>
                              <p className="text-foreground whitespace-pre-wrap">{activity.result}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {agentActivity.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No agent activity yet. Start agent work to see progress.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Progress */}
              <div className="p-4 rounded-lg border bg-card space-y-3">
                <h4 className="text-sm font-medium">Progress</h4>
                <div className="flex items-center gap-3">
                  <Progress value={progress} className="flex-1" />
                  <span className="text-sm font-medium">{progress}%</span>
                </div>
                {isAgentRunning && task.assigneeAgentType && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm text-blue-500">
                      <Loader2 className="size-3 animate-spin" />
                      Agent is working...
                    </div>
                    {agentPhase && (
                      <p className="text-xs text-muted-foreground ml-5">{agentPhase}</p>
                    )}
                  </div>
                )}
                {!isAgentRunning && task.assigneeAgentType && progress < 100 && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleAgentRunning}
                      className="w-full gap-2"
                    >
                      <Play className="size-3" />
                      Quick Agent Work
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={startDeepResearch}
                      className="w-full gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    >
                      <Sparkles className="size-3" />
                      🔬 Deep Research
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Deep Research: Web search with real sources
                    </p>
                  </div>
                )}
                {!isAgentRunning && !task.assigneeAgentType && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={startDeepResearch}
                    className="w-full gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Sparkles className="size-3" />
                    🔬 Deep Research
                  </Button>
                )}
                {progress === 100 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-500">
                      <CheckCircle2 className="size-4" />
                      All subtasks completed!
                    </div>
                    {finalReport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          document.getElementById("final-report")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="w-full gap-2"
                      >
                        <Sparkles className="size-3 text-purple-500" />
                        View Final Report
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="p-4 rounded-lg border bg-card space-y-4">
                <h4 className="text-sm font-medium">Details</h4>

                {/* Status */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Status</label>
                  <Select
                    value={task.status}
                    onValueChange={(value: TaskStatus) => handleStatusChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <config.icon className={`size-4 ${config.color}`} />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Priority</label>
                  <Select
                    value={task.priority}
                    onValueChange={(value: TaskPriority) => handlePriorityChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(priorityConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div className={`size-2 rounded-full ${config.color}`} />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignee */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Assigned to</label>
                  <div className="flex items-center gap-2 p-2 rounded border">
                    <Avatar className="size-6">
                      <AvatarFallback>
                        {task.assigneeAgentType ? <Bot className="size-3" /> : <User className="size-3" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      {task.assigneeAgentType 
                        ? agentNames[task.assigneeAgentType] || "AI Agent"
                        : "You"
                      }
                    </span>
                    {task.assigneeAgentType && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        <Sparkles className="size-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Due Date */}
                {task.dueDate && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Due date</label>
                    <div className="flex items-center gap-2 p-2 rounded border">
                      <Calendar className="size-4 text-muted-foreground" />
                      <span className="text-sm">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                      {task.dueDate < Date.now() && (
                        <Badge variant="destructive" className="ml-auto text-xs">
                          Overdue
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Created/Updated */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
                  <p>Updated: {new Date(task.updatedAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-4 rounded-lg border bg-card space-y-3">
                <h4 className="text-sm font-medium">Quick Actions</h4>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                    <MessageSquare className="size-4" />
                    Ask AI about this task
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2" 
                    size="sm"
                    onClick={breakdownWithAI}
                    disabled={breakdownLoading || !description}
                  >
                    {breakdownLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Break into subtasks
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                    <AlertCircle className="size-4" />
                    Report issue
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
