"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Loader2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { PartialBlock } from "@blocknote/core";
import { LivingPlanInspector } from "./_components/living-plan-inspector";
import { useT, useLocale } from "@/lib/i18n/provider";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";

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
  isAiGenerated: boolean;
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
  const t = useT();
  const { locale } = useLocale();
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
  const editorContentRef = useRef<BlockNoteContent>([]);
  const materializeTimerRef = useRef<number | null>(null);
  const documentId = String(params.id || "");
  const displayTitle = localizeGeneratedCopy(
    title === "Generated Document" ? t("docs.detail.generatedTitle") : title,
    locale
  );
  const savedTime = lastSaved?.toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
        setError(err instanceof Error ? err.message : t("docs.detail.loadFailed"));
      } finally {
        setIsLoading(false);
      }
    }
    
    if (params.id) {
      fetchDoc();
    }
  }, [params.id, t]);

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
            error: data.error || t("docs.detail.taskWorkflowFailed"),
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
  }, [taskWorkflow, t]);

  const persistMaterializedContent = useCallback(
    async (content: BlockNoteContent, updateUi = true) => {
      if (!documentId) return;
      if (updateUi) setIsSaving(true);

      try {
        const response = await fetch(`/api/docs/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, materializedOnly: true }),
        });
        if (!response.ok) {
          throw new Error(`Materialized content save failed: ${response.status}`);
        }

        if (updateUi) {
          setLastSaved(new Date());
          setDoc((current) => (current ? { ...current, content } : current));
        }
      } catch (err) {
        console.error("Failed to materialize collaborative content:", err);
      } finally {
        if (updateUi) setIsSaving(false);
      }
    },
    [documentId]
  );

  const handleContentChange = useCallback((content: BlockNoteContent) => {
    editorContentRef.current = content;
    setIsSaving(true);

    if (materializeTimerRef.current) {
      window.clearTimeout(materializeTimerRef.current);
    }
    materializeTimerRef.current = window.setTimeout(() => {
      materializeTimerRef.current = null;
      void persistMaterializedContent(content);
    }, 1500);
  }, [persistMaterializedContent]);

  const flushMaterializedContent = useCallback(async () => {
    if (materializeTimerRef.current) {
      window.clearTimeout(materializeTimerRef.current);
      materializeTimerRef.current = null;
    }
    if (editorContentRef.current.length > 0) {
      await persistMaterializedContent(editorContentRef.current);
    }
  }, [persistMaterializedContent]);

  useEffect(() => {
    return () => {
      if (materializeTimerRef.current) {
        window.clearTimeout(materializeTimerRef.current);
        materializeTimerRef.current = null;
        if (editorContentRef.current.length > 0 && documentId) {
          void fetch(`/api/docs/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: editorContentRef.current,
              materializedOnly: true,
            }),
            keepalive: true,
          });
        }
      }
    };
  }, [documentId]);

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
    await flushMaterializedContent();
    const currentContent = editorContentRef.current.length > 0 
      ? editorContentRef.current 
      : doc?.content || [];
    const textContent = extractTextFromContent(currentContent);
    
    if (!textContent.trim()) {
      alert(t("docs.detail.emptyContent"));
      return;
    }

    setAiLoading(action);
    setAiSuccess(null);

    try {
      let prompt = "";
      let agentMode = "writer";

      // These actions paste the result straight into a document, so the model
      // must return ONLY the transformed text — no conversational preamble
      // ("Elbette...", "İşte..."), no trailing commentary, no code fences.
      const ONLY_RESULT =
        `\n\nÖNEMLİ: Yalnızca sonuç metnini döndür. "Elbette", "İşte", "Tabii" gibi giriş cümleleri, ` +
        `sonunda açıklama/yorum veya "---" ayraçları EKLEME. Çıktın doğrudan dokümana yapıştırılacak.`;

      switch (action) {
        case "summarize":
          prompt = `Aşağıdaki metni Türkçe özetle.${ONLY_RESULT}\n\nMETİN:\n${textContent}`;
          agentMode = "research";
          break;
        case "expand":
          prompt = `Aşağıdaki metni genişlet ve daha detaylı hale getir.${ONLY_RESULT}\n\nMETİN:\n${textContent}`;
          agentMode = "writer";
          break;
        case "improve":
          prompt = `Aşağıdaki metnin yazımını iyileştir; daha akıcı ve profesyonel yap.${ONLY_RESULT}\n\nMETİN:\n${textContent}`;
          agentMode = "writer";
          break;
        case "tasks":
          if (!doc?.workspaceId) {
            throw new Error(t("docs.detail.workspaceMissing"));
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
                projectDescription:
                  locale === "tr"
                    ? `"${displayTitle}" başlıklı bu plandan uygulanabilir görevler çıkar:\n\n${textContent}`
                    : `Create actionable tasks from this plan titled "${displayTitle}":\n\n${textContent}`,
              },
            }),
          });

          if (!workflowResponse.ok) {
            const errorBody = await workflowResponse.json().catch(() => null);
            throw new Error(errorBody?.message || errorBody?.error || t("docs.detail.taskWorkflowStartFailed"));
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

      if (!response.ok) throw new Error(t("docs.detail.aiRequestFailed"));

      const rawResult = await response.text();

      // Safety net: strip any conversational framing the model still added, so
      // only the transformed text lands in the document.
      const cleanAiText = (raw: string): string => {
        const lines = raw.trim().split("\n");
        const first = (lines[0] || "").trim();
        if (lines.length > 1 && /^(elbette|i̇şte|işte|tabii?|harika|peki)\b/i.test(first) && first.endsWith(":")) {
          lines.shift();
        }
        return lines
          .join("\n")
          .replace(/^(\s*---\s*\n?)+/, "")
          .replace(/(\n?\s*---\s*)+\s*$/, "")
          .trim();
      };
      const result = cleanAiText(rawResult);

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
          title: `${actionNames[action]}: ${displayTitle}`,
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
      alert(t("docs.detail.aiActionFailed"));
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
    if (!confirm(t("docs.detail.deleteConfirm"))) return;
    
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
      alert(t("docs.detail.shareCopied"));
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFavorite = () => {
    alert(t("docs.detail.favoriteAdded"));
  };

  const handleDuplicate = async () => {
    if (!doc) return;
    
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: `${displayTitle} (Kopya)`,
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
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <FileText className="size-16 text-muted-foreground/60" />
        <h2 className="text-xl font-semibold">{t("docs.detail.notFoundTitle")}</h2>
        <p className="text-muted-foreground max-w-sm">
          {t("docs.detail.notFoundDesc")}
        </p>
        {error && error !== "Document not found" && (
          <p className="text-xs text-muted-foreground/70 max-w-sm">{error}</p>
        )}
        <Link href="/dashboard/docs" className="mt-2">
          <Button>{t("docs.detail.backToDocs")}</Button>
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
            value={displayTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
            placeholder={t("docs.detail.untitled")}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Save Status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isSaving ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>{t("docs.detail.saving")}</span>
              </>
            ) : lastSaved ? (
              <>
                <Clock className="size-3" />
                <span>{t("docs.detail.saved")} {savedTime}</span>
              </>
            ) : null}
          </div>

          {doc.isAiGenerated && (
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
              <Sparkles className="size-3" />
              {t("docs.detail.aiGenerated")}
            </div>
          )}

          <Button variant="outline" size="sm" className="gap-1" onClick={handleShare}>
            <Share2 className="size-3" />
            {t("docs.detail.share")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleFavorite}>
                <Star className="size-4 mr-2" />
                {t("docs.detail.addFavorite")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="size-4 mr-2" />
                {t("docs.detail.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                <Trash2 className="size-4 mr-2" />
                {t("docs.detail.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Plan editor and traceability inspector */}
      <div className="flex-1 overflow-auto">
        <div className="grid min-h-full w-full lg:grid-cols-[minmax(0,1fr)_minmax(440px,28vw)] 2xl:grid-cols-[minmax(0,1fr)_minmax(520px,30vw)]">
          <div className="min-w-0 px-4 py-8 sm:px-8 lg:px-10 xl:px-14">
            {session?.user ? (
              <CollaborativeEditorWrapper
                key={`collab-${doc.id}`}
                documentId={doc.id}
                userId={session.user.id}
                userName={session.user.name || session.user.email?.split('@')[0] || t("docs.detail.anonymous")}
                initialContent={editorContentRef.current.length > 0 ? editorContentRef.current : (doc.content && doc.content.length > 0 ? doc.content : undefined)}
                onChange={handleContentChange}
                editable={true}
              />
            ) : (
              <EditorWrapper
                key={`editor-${doc.id}`}
                initialContent={editorContentRef.current.length > 0 ? editorContentRef.current : (doc.content && doc.content.length > 0 ? doc.content : undefined)}
                editable={false}
              />
            )}
          </div>
          <LivingPlanInspector docId={doc.id} savePending={isSaving} />
        </div>
      </div>

      {/* AI Assistant Bar */}
      <div className="border-t px-6 py-3 bg-muted/30">
        <div className="max-w-[1420px] mx-auto flex items-center gap-3">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            {t("docs.detail.aiAssistant")}:
          </span>
          <div className="flex-1 flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("summarize")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "summarize" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> {t("docs.detail.summarizing")}</>
              ) : aiSuccess === "summarize" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> {t("docs.detail.summarizeDone")}</>
              ) : (
                t("docs.detail.summarize")
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("expand")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "expand" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> {t("docs.detail.expanding")}</>
              ) : aiSuccess === "expand" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> {t("docs.detail.expandDone")}</>
              ) : (
                t("docs.detail.expand")
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleAiAction("improve")}
              disabled={aiLoading !== null}
            >
              {aiLoading === "improve" ? (
                <><Loader2 className="size-3 animate-spin mr-1" /> {t("docs.detail.improving")}</>
              ) : aiSuccess === "improve" ? (
                <><CheckCircle2 className="size-3 mr-1 text-green-500" /> {t("docs.detail.improveDone")}</>
              ) : (
                t("docs.detail.improve")
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
