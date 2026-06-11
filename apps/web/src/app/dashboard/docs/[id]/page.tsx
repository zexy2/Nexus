"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  MoreHorizontal,
  Sparkles,
  Clock,
  Share2,
  Trash2,
  Copy,
  Star,
  FileText,
  Users,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { PartialBlock } from "@blocknote/core";

// BlockNote content type alias
type BlockNoteContent = PartialBlock[];

// Dynamic import for BlockNote editor (client-side only)
const EditorWrapper = dynamic(
  () => import("@/components/editor").then((mod) => mod.EditorWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[500px] rounded-lg border bg-muted/30 animate-pulse flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// Dynamic import for Collaborative Editor (with real-time sync)
const CollaborativeEditorWrapper = dynamic(
  () => import("@/components/editor/collaborative-editor").then((mod) => mod.CollaborativeEditorWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[550px] rounded-lg border bg-muted/30 animate-pulse flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface Document {
  id: string;
  workspaceId: string;
  title: string;
  iconEmoji: string | null;
  content: BlockNoteContent;
  createdBy: string | null;
  updatedAt: string;
}

type TaskWorkflowState = {
  workflowId: string;
  executionId: string;
  status: "running" | "completed" | "failed";
  taskCount?: number;
  error?: string;
};

function extractCreatedTasks(result: unknown): Array<{ id?: string; title?: string }> {
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  if (Array.isArray(record.tasks)) return record.tasks as Array<{ id?: string; title?: string }>;
  if (record.result && typeof record.result === "object") {
    const nested = record.result as Record<string, unknown>;
    if (Array.isArray(nested.tasks)) return nested.tasks as Array<{ id?: string; title?: string }>;
  }
  return [];
}

export default function DocDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [taskWorkflow, setTaskWorkflow] = useState<TaskWorkflowState | null>(null);
  const [collaborativeMode, setCollaborativeMode] = useState(false);
  const editorContentRef = useRef<BlockNoteContent>([]);

  // Fetch document from API
  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/api/docs/${params.id}`);
        if (!res.ok) {
          throw new Error("Document not found");
        }
        const data = await res.json();
        setDoc(data);
        setTitle(data.title);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document");
      } finally {
        setIsLoading(false);
      }
    }
    
    if (params.id) {
      fetchDoc();
    }
  }, [params.id]);

  useEffect(() => {
    if (!taskWorkflow || taskWorkflow.status !== "running") return;

    const workflowId = taskWorkflow.workflowId;
    const executionId = taskWorkflow.executionId;
    let cancelled = false;

    async function pollTaskWorkflow() {
      try {
        const res = await fetch(`/api/workflows?workflowId=${workflowId}`);
        const data = await res.json().catch(() => null);

        if (cancelled || !res.ok || !data) return;

        if (data.status === "completed") {
          const tasks = extractCreatedTasks(data.result);
          setTaskWorkflow({
            workflowId,
            executionId,
            status: "completed",
            taskCount: tasks.length,
          });
          setAiSuccess("tasks");
          setAiLoading(null);
        } else if (data.status === "failed") {
          setTaskWorkflow({
            workflowId,
            executionId,
            status: "failed",
            error: data.error || "Task workflow failed",
          });
          setAiLoading(null);
        }
      } catch (err) {
        console.error("Failed to poll task workflow:", err);
      }
    }

    void pollTaskWorkflow();
    const interval = window.setInterval(pollTaskWorkflow, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [taskWorkflow]);

  const handleContentChange = async (content: BlockNoteContent) => {
    if (!doc) return;
    
    editorContentRef.current = content;
    setIsSaving(true);
    try {
      await fetch(`/api/docs/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Extract text from BlockNote content
  const extractTextFromContent = (content: BlockNoteContent): string => {
    if (!content || !Array.isArray(content)) return "";
    return content.map(block => {
      if (block.content && Array.isArray(block.content)) {
        return (block.content as Array<{ text?: string }>).map((c) => c.text || "").join("");
      }
      return "";
    }).join("\n");
  };

  // AI Actions
  const handleAiAction = async (action: "summarize" | "expand" | "improve" | "tasks") => {
    const currentContent = editorContentRef.current.length > 0 
      ? editorContentRef.current 
      : doc?.content || [];
    const textContent = extractTextFromContent(currentContent);
    
    if (!textContent.trim()) {
      alert("Doküman içeriği boş. Lütfen önce içerik ekleyin.");
      return;
    }

    setAiLoading(action);
    setAiSuccess(null);

    try {
      let prompt = "";
      let agentMode = "writer";

      switch (action) {
        case "summarize":
          prompt = `Bu metni Türkçe olarak özetle:\n\n${textContent}`;
          agentMode = "research";
          break;
        case "expand":
          prompt = `Bu metni genişlet, daha detaylı hale getir:\n\n${textContent}`;
          agentMode = "writer";
          break;
        case "improve":
          prompt = `Bu metnin yazımını iyileştir, daha akıcı ve profesyonel hale getir:\n\n${textContent}`;
          agentMode = "writer";
          break;
        case "tasks":
          if (!doc?.workspaceId) {
            throw new Error("Workspace not found for this document");
          }

          const workflowResponse = await fetch("/api/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workflowType: "tasks",
              workspaceId: doc.workspaceId,
              input: {
                workspaceId: doc.workspaceId,
                docId: doc.id,
                projectDescription: `Create actionable tasks from this document titled "${title}":\n\n${textContent}`,
              },
            }),
          });

          if (!workflowResponse.ok) {
            const errorBody = await workflowResponse.json().catch(() => null);
            throw new Error(errorBody?.message || errorBody?.error || "Task workflow failed to start");
          }

          const workflow = await workflowResponse.json();
          setTaskWorkflow({
            workflowId: workflow.workflowId,
            executionId: workflow.executionId,
            status: "running",
          });
          return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          agentMode,
        }),
      });

      if (!response.ok) throw new Error("AI request failed");

      const result = await response.text();

      // Metni BlockNote formatına dönüştür
      const textToBlockNoteContent = (text: string) => {
        const paragraphs = text.split("\n\n").filter(p => p.trim());
        return paragraphs.map(paragraph => ({
          type: "paragraph",
          content: [{ type: "text", text: paragraph.trim() }]
        }));
      };

      // Yeni doküman oluştur
      const actionNames = {
        summarize: "Özet",
        expand: "Genişletilmiş",
        improve: "İyileştirilmiş",
      };
      
      // AI sonucunu BlockNote formatına çevir
      const blockNoteContent = textToBlockNoteContent(result);
      
      const newDocRes = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: `${actionNames[action]}: ${title}`,
          content: blockNoteContent 
        }),
      });
      
      if (newDocRes.ok) {
        const newDoc = await newDocRes.json();
        setAiSuccess(action);
        setTimeout(() => {
          router.push(`/dashboard/docs/${newDoc.id}`);
        }, 1000);
      }
    } catch (err) {
      console.error("AI action failed:", err);
      alert("AI işlemi başarısız oldu. Lütfen tekrar deneyin.");
      if (action === "tasks") {
        setTaskWorkflow(null);
      }
    } finally {
      if (action !== "tasks") {
        setAiLoading(null);
      }
    }
  };

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    if (!doc) return;
    
    setIsSaving(true);
    try {
      await fetch(`/api/docs/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error("Failed to save title:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    
    try {
      await fetch(`/api/docs/${params.id}`, { method: "DELETE" });
      router.push("/dashboard/docs");
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link panoya kopyalandı!");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFavorite = () => {
    alert("Favorilere eklendi! ⭐");
  };

  const handleDuplicate = async () => {
    if (!doc) return;
    
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: `${title} (Kopya)`,
          content: doc.content || []
        }),
      });
      
      if (res.ok) {
        const newDoc = await res.json();
        router.push(`/dashboard/docs/${newDoc.id}`);
      }
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <FileText className="size-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Document not found</h2>
        <p className="text-muted-foreground">{error}</p>
        <Link href="/dashboard/docs">
          <Button>Back to Documents</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <Link href="/dashboard/docs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-2xl">{doc.iconEmoji || "📄"}</span>
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
            placeholder="Untitled"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Save Status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isSaving ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Saving...</span>
              </>
            ) : lastSaved ? (
              <>
                <Clock className="size-3" />
                <span>Saved {lastSaved.toLocaleTimeString()}</span>
              </>
            ) : null}
          </div>

          {doc.createdBy && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" />
              AI Generated
            </Badge>
          )}

          <Button variant="outline" size="sm" className="gap-1" onClick={handleShare}>
            <Share2 className="size-3" />
            Share
          </Button>

          {/* Collaboration Toggle */}
          <div className="flex items-center gap-2 px-2 border-l ml-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Collab</span>
            <Switch
              checked={collaborativeMode}
              onCheckedChange={setCollaborativeMode}
              aria-label="Toggle collaborative editing"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleFavorite}>
                <Star className="size-4 mr-2" />
                Add to favorites
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="size-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          {collaborativeMode && session?.user ? (
            <CollaborativeEditorWrapper
              key={`collab-${doc.id}`}
              documentId={doc.id}
              userId={session.user.id}
              userName={session.user.name || session.user.email?.split('@')[0] || 'Anonymous'}
              initialContent={editorContentRef.current.length > 0 ? editorContentRef.current : (doc.content && doc.content.length > 0 ? doc.content : undefined)}
              onChange={handleContentChange}
              editable={true}
            />
          ) : (
            <EditorWrapper
              key={`editor-${doc.id}-${collaborativeMode}`}
              initialContent={editorContentRef.current.length > 0 ? editorContentRef.current : (doc.content && doc.content.length > 0 ? doc.content : undefined)}
              onChange={handleContentChange}
              editable={true}
            />
          )}
        </div>
      </div>

      {/* AI Assistant Bar */}
      <div className="border-t px-6 py-3 bg-muted/30">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            AI Assistant:
          </span>
          <div className="flex-1 flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("summarize")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "summarize" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> Özetleniyor...</>
              ) : aiSuccess === "summarize" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> Özet oluşturuldu!</>
              ) : (
                "Özetle"
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("expand")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "expand" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> Genişletiliyor...</>
              ) : aiSuccess === "expand" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> Genişletildi!</>
              ) : (
                "Genişlet"
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("improve")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "improve" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> İyileştiriliyor...</>
              ) : aiSuccess === "improve" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> İyileştirildi!</>
              ) : (
                "Yazımı İyileştir"
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("tasks")}
              disabled={aiLoading !== null}
            >
              {taskWorkflow?.status === "running" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> Workflow çalışıyor...</>
              ) : taskWorkflow?.status === "completed" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> {taskWorkflow.taskCount || 0} görev oluşturuldu</>
              ) : aiLoading === "tasks" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> Başlatılıyor...</>
              ) : aiSuccess === "tasks" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> Görevler hazır</>
              ) : (
                "Görev Çıkar"
              )}
            </Button>
          </div>
        </div>
        {taskWorkflow && (
          <div className="max-w-4xl mx-auto mt-2 text-xs">
            {taskWorkflow.status === "running" && (
              <span className="text-muted-foreground">
                Task breakdown workflow running. Execution: {taskWorkflow.executionId}
              </span>
            )}
            {taskWorkflow.status === "completed" && (
              <Link href="/dashboard/tasks" className="text-primary hover:underline">
                {taskWorkflow.taskCount || 0} task created. Open Kanban.
              </Link>
            )}
            {taskWorkflow.status === "failed" && (
              <span className="text-destructive">
                Task workflow failed: {taskWorkflow.error || "Unknown error"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
