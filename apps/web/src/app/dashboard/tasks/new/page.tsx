"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Loader2,
  BrainCircuit,
  Flag,
  Calendar,
  CheckCircle2,
  Trash2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

type TaskPriority = "low" | "medium" | "high" | "urgent";

const priorityConfig = {
  low: { label: "Low", color: "bg-gray-500", badgeClass: "bg-slate-100 text-slate-700" },
  medium: { label: "Medium", color: "bg-yellow-500", badgeClass: "bg-blue-100 text-blue-700" },
  high: { label: "High", color: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-500", badgeClass: "bg-red-100 text-red-700" },
};

const agentTypes = [
  { id: "supervisor", name: "Supervisor Agent", description: "Orchestrates and delegates tasks" },
  { id: "writer", name: "Writer Agent", description: "Creates and edits documents" },
  { id: "researcher", name: "Research Agent", description: "Performs web research" },
  { id: "coder", name: "Code Agent", description: "Writes and reviews code" },
  { id: "designer", name: "Design Agent", description: "Creates UI/UX designs" },
];

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aiBreakdown, setAiBreakdown] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    assignToAgent: false,
    agentType: "supervisor",
    dueDate: "",
  });
  
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    
    setLoading(true);
    
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          assignToAgent: formData.assignToAgent,
          agentType: formData.agentType,
          dueDate: formData.dueDate ? new Date(formData.dueDate).getTime() : null,
          subtasks: subtasks.map(s => ({ title: s.title })),
        }),
      });
      
      if (res.ok) {
        const task = await res.json();
        router.push(`/dashboard/tasks/${task.id}`);
      } else {
        console.error("Failed to create task");
      }
    } catch (error) {
      console.error("Error creating task:", error);
    } finally {
      setLoading(false);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks(prev => [...prev, { 
      id: `temp-${Date.now()}`, 
      title: newSubtask, 
      completed: false 
    }]);
    setNewSubtask("");
  };

  const removeSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== id));
  };

  const breakdownWithAI = async () => {
    if (!formData.description.trim()) return;
    
    setBreakdownLoading(true);
    
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Break down this task into 3-6 actionable subtasks. Task: "${formData.title}". Description: "${formData.description}". 

Return ONLY a JSON array of subtask titles, nothing else. Example: ["Subtask 1", "Subtask 2", "Subtask 3"]`
          }],
          mode: "auto",
        }),
      });
      
      if (res.ok) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "final" && data.content) {
                    fullText = data.content;
                  }
                } catch {}
              }
            }
          }
        }
        
        // Parse the AI response
        const jsonMatch = fullText.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          try {
            const subtaskTitles = JSON.parse(jsonMatch[0]);
            if (Array.isArray(subtaskTitles)) {
              const newSubtasks = subtaskTitles.map((title: string, i: number) => ({
                id: `ai-${Date.now()}-${i}`,
                title: typeof title === "string" ? title : String(title),
                completed: false,
              }));
              setSubtasks(prev => [...prev, ...newSubtasks]);
            }
          } catch (e) {
            console.error("Failed to parse AI subtasks:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error breaking down task:", error);
    } finally {
      setBreakdownLoading(false);
    }
  };

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
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Create New Task</h1>
          <p className="text-sm text-muted-foreground">
            Add a new task to your board
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto py-8 px-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title & Priority */}
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
                <CardDescription>
                  Give your task a clear title and description
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Enter task title..."
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="mt-1.5"
                    autoFocus
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the task in detail..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="mt-1.5 min-h-[100px]"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: TaskPriority) => 
                        setFormData(prev => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
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
                  
                  <div>
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Agent Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="size-5 text-purple-500" />
                  AI Agent Assignment
                </CardTitle>
                <CardDescription>
                  Optionally assign this task to an AI agent for autonomous completion
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Assign to AI Agent</Label>
                    <p className="text-sm text-muted-foreground">
                      Let an AI agent work on this task automatically
                    </p>
                  </div>
                  <Switch
                    checked={formData.assignToAgent}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, assignToAgent: checked }))
                    }
                  />
                </div>
                
                {formData.assignToAgent && (
                  <div className="space-y-3 pt-2">
                    <Label>Select Agent Type</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {agentTypes.map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, agentType: agent.id }))}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                            formData.agentType === agent.id
                              ? "border-purple-500 bg-purple-50 dark:bg-purple-950"
                              : "hover:bg-muted"
                          }`}
                        >
                          <BrainCircuit className={`size-5 ${
                            formData.agentType === agent.id ? "text-purple-500" : "text-muted-foreground"
                          }`} />
                          <div>
                            <p className="font-medium text-sm">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.description}</p>
                          </div>
                          {formData.agentType === agent.id && (
                            <CheckCircle2 className="size-5 text-purple-500 ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subtasks */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Subtasks</CardTitle>
                    <CardDescription>
                      Break down your task into smaller actionable items
                    </CardDescription>
                  </div>
                  {formData.description && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={breakdownWithAI}
                      disabled={breakdownLoading}
                      className="gap-2"
                    >
                      {breakdownLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4 text-purple-500" />
                      )}
                      AI Breakdown
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a subtask..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                  />
                  <Button type="button" onClick={addSubtask} size="icon" variant="secondary">
                    <Plus className="size-4" />
                  </Button>
                </div>
                
                {subtasks.length > 0 && (
                  <div className="space-y-2">
                    {subtasks.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card group"
                      >
                        <CheckCircle2 className="size-4 text-muted-foreground" />
                        <span className="flex-1 text-sm">{subtask.title}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeSubtask(subtask.id)}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/tasks">Cancel</Link>
              </Button>
              <Button type="submit" disabled={!formData.title.trim() || loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="size-4 mr-2" />
                    Create Task
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
