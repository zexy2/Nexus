"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FloatingAIWidget } from "./floating-ai-widget";
import { AgentMarginComments, type AgentComment } from "./agent-margin-comments";
import { AgentCursors, type AgentCursor } from "./agent-cursors";
import { useAIWrite, useAIWriteSession, useAIWriteChunks } from "@/lib/ai/ai-write";
import { cn } from "@/lib/utils";
import { Pause, Play, Sparkles, Loader2 } from "lucide-react";

interface DocumentEditorProps {
  documentId?: string;
  initialTitle?: string;
  initialContent?: string;
  onTitleChange?: (title: string) => void;
  onContentChange?: (content: string) => void;
  onSave?: () => void;
}

export function DocumentEditor({
  documentId,
  initialTitle = "",
  initialContent = "",
  onTitleChange,
  onContentChange,
  onSave,
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showAIWidget, setShowAIWidget] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [aiWritePrompt, setAiWritePrompt] = useState("");
  const [showAIWriteInput, setShowAIWriteInput] = useState(false);

  // AI Write hooks
  const { startWriting, pauseWriting, resumeWriting, stopWriting } = useAIWrite();
  const aiSession = useAIWriteSession(documentId || "new");
  const isAIWriting = aiSession?.status === "writing";

  // Simulated agent comments for the "wow factor"
  const [agentComments, setAgentComments] = useState<AgentComment[]>([
    {
      id: "1",
      agentName: "Researcher",
      agentColor: "#10b981",
      message: "Verifying this claim against sources...",
      status: "loading",
      lineNumber: 3,
    },
    {
      id: "2",
      agentName: "Writer",
      agentColor: "#7c3aed",
      message: "This paragraph could be more concise.",
      status: "complete",
      lineNumber: 7,
    },
  ]);

  // Simulated agent cursors
  const [agentCursors, setAgentCursors] = useState<AgentCursor[]>([
    {
      id: "nexus-ai",
      name: "Nexus AI",
      color: "#7c3aed",
      position: { top: 120, left: 280 },
      isTyping: true,
    },
  ]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return "Heading...";
          }
          return "Start writing, or press '/' for commands...";
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
    ],
    content: initialContent || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc dark:prose-invert prose-lg max-w-none focus:outline-none min-h-[500px] font-serif",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onContentChange?.(html);
      
      // Auto-save simulation
      setIsSaving(true);
      setTimeout(() => {
        setIsSaving(false);
        setLastSaved(new Date());
      }, 500);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const text = editor.state.doc.textBetween(from, to, " ");
        setSelectedText(text);
        
        // Get selection coordinates for floating widget
        const { view } = editor;
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        setSelectionRect(new DOMRect(
          start.left,
          start.top,
          end.right - start.left,
          end.bottom - start.top
        ));
        setShowAIWidget(true);
      } else {
        setShowAIWidget(false);
        setSelectedText("");
        setSelectionRect(null);
      }
    },
  });

  // Handle AI Write content streaming via hook - must be after editor definition
  useAIWriteChunks(documentId || "new", useCallback((chunk) => {
    if (editor && chunk.content) {
      // Insert AI-generated content at the current cursor position
      editor.chain().focus().insertContent(chunk.content).run();
    }
  }, [editor]));

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      onTitleChange?.(newTitle);
    },
    [onTitleChange]
  );

  const handleAIAction = useCallback(
    async (action: string, _customPrompt?: string) => {
      if (!editor || !selectedText) return;

      // Add a "thinking" comment
      const newComment: AgentComment = {
        id: Date.now().toString(),
        agentName: action === "grammar" ? "Editor" : "Writer",
        agentColor: action === "grammar" ? "#f59e0b" : "#7c3aed",
        message: `Processing: "${action}"...`,
        status: "loading",
        lineNumber: Math.floor(Math.random() * 10) + 1,
      };
      setAgentComments((prev) => [...prev, newComment]);

      // Simulate AI processing
      setTimeout(() => {
        setAgentComments((prev) =>
          prev.map((c) =>
            c.id === newComment.id
              ? { ...c, status: "complete" as const, message: `Applied ${action} to selection.` }
              : c
          )
        );
      }, 2000);
    },
    [editor, selectedText]
  );

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onSave]);

  // Start AI Write
  const handleStartAIWrite = useCallback(async () => {
    if (!aiWritePrompt.trim() || !documentId) return;
    
    await startWriting(documentId, aiWritePrompt, { agentType: "writer" });
    
    setAiWritePrompt("");
    setShowAIWriteInput(false);
  }, [aiWritePrompt, documentId, startWriting]);

  // Toggle AI Write pause/resume
  const handleToggleAIWrite = useCallback(() => {
    if (!documentId) return;
    
    if (aiSession?.status === "writing") {
      pauseWriting(documentId);
    } else if (aiSession?.status === "paused") {
      resumeWriting(documentId);
    }
  }, [aiSession, documentId, pauseWriting, resumeWriting]);

  // Stop AI Write
  const handleStopAIWrite = useCallback(() => {
    if (!documentId) return;
    stopWriting(documentId);
  }, [documentId, stopWriting]);

  // Simulate agent cursor movement
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentCursors((prev) =>
        prev.map((cursor) => ({
          ...cursor,
          position: {
            top: cursor.position.top + (Math.random() - 0.5) * 20,
            left: cursor.position.left + (Math.random() - 0.5) * 30,
          },
          isTyping: Math.random() > 0.3,
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex min-h-screen">
      {/* Main Editor Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Status Bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-mono">
              {documentId ? `DOC-${documentId.slice(0, 8)}` : "New Document"}
            </span>
            <span className="w-px h-4 bg-white/10" />
            <AnimatePresence mode="wait">
              {isSaving ? (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-zinc-400"
                >
                  Saving...
                </motion.span>
              ) : lastSaved ? (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-emerald-500"
                >
                  Saved
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Write Controls */}
            {isAIWriting || aiSession?.status === "paused" ? (
              <div className="flex items-center gap-2 mr-4">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-500/20 border border-violet-500/30">
                  <Loader2 className={cn("w-3 h-3 text-violet-400", isAIWriting && "animate-spin")} />
                  <span className="text-xs text-violet-300">
                    {isAIWriting ? "AI writing..." : "Paused"}
                  </span>
                </div>
                <button
                  onClick={handleToggleAIWrite}
                  className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  title={isAIWriting ? "Pause" : "Resume"}
                >
                  {isAIWriting ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleStopAIWrite}
                  className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-colors"
                  title="Stop"
                >
                  <span className="w-2.5 h-2.5 block bg-current rounded-sm" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAIWriteInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 hover:text-violet-200 transition-colors mr-4"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">AI Write</span>
              </button>
            )}
            
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-xs text-zinc-400">Nexus AI active</span>
            </div>
          </div>
        </div>

        {/* Editor Canvas - Centered, max-width 800px */}
        <div className="flex-1 flex justify-center px-6 py-12 overflow-auto">
          <div className="w-full max-w-[800px] relative">
            {/* Agent Cursors Layer */}
            <AgentCursors cursors={agentCursors} />

            {/* Title Input */}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className={cn(
                "w-full text-4xl font-bold bg-transparent border-none outline-none",
                "text-white placeholder:text-zinc-600",
                "font-serif tracking-tight mb-8"
              )}
            />

            {/* Tiptap Editor */}
            <div className="relative">
              <EditorContent
                editor={editor}
                className="document-editor-content"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Margin Comments - Right Side */}
      <AgentMarginComments
        comments={agentComments}
        onDismiss={(id: string) =>
          setAgentComments((prev) => prev.filter((c) => c.id !== id))
        }
      />

      {/* Floating AI Widget */}
      <FloatingAIWidget
        isVisible={showAIWidget}
        selectedText={selectedText}
        selectionRect={selectionRect}
        onAction={handleAIAction}
        onClose={() => setShowAIWidget(false)}
      />

      {/* AI Write Input Modal */}
      <AnimatePresence>
        {showAIWriteInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAIWriteInput(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg p-6 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-violet-500/20">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">AI Write</h3>
                  <p className="text-sm text-zinc-400">Describe what you want the AI to write</p>
                </div>
              </div>
              
              <textarea
                value={aiWritePrompt}
                onChange={(e) => setAiWritePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleStartAIWrite();
                  }
                }}
                placeholder="e.g., Write an introduction about the benefits of renewable energy..."
                className="w-full h-32 p-4 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                autoFocus
              />
              
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-zinc-500">
                  Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">⌘ Enter</kbd> to start
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAIWriteInput(false)}
                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartAIWrite}
                    disabled={!aiWritePrompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Start Writing
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
