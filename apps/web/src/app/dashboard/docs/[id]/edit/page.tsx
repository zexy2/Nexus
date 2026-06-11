"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Settings,
  Users,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Dynamic import for the document editor (avoid SSR issues with Tiptap)
const DocumentEditor = dynamic(
  () =>
    import("@/components/editor").then((mod) => mod.DocumentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
          <p className="text-sm text-zinc-500">Loading editor...</p>
        </div>
      </div>
    ),
  }
);

interface Document {
  id: string;
  title: string;
  content: string;
  iconEmoji?: string;
  updatedAt: string;
}

export default function DocumentEditPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, isPending: isSessionLoading } = useSession();
  const documentId = params.id as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(true);

  // Fetch document
  useEffect(() => {
    async function fetchDocument() {
      if (!documentId) return;

      try {
        setIsLoading(true);
        const res = await fetch(`/api/docs/${documentId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Document not found");
          } else {
            setError("Failed to load document");
          }
          return;
        }
        const data = await res.json();
        setDoc(data);
      } catch (err) {
        console.error("Failed to fetch document:", err);
        setError("Failed to load document");
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocument();
  }, [documentId]);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!doc) return;
      setDoc((prev) => (prev ? { ...prev, title: newTitle } : null));

      // Debounced save would go here
      try {
        await fetch(`/api/docs/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
      } catch (err) {
        console.error("Failed to save title:", err);
      }
    },
    [doc, documentId]
  );

  const handleContentChange = useCallback(
    async (newContent: string) => {
      if (!doc) return;
      setDoc((prev) => (prev ? { ...prev, content: newContent } : null));

      // Auto-save would be handled here
    },
    [doc]
  );

  const handleSave = useCallback(async () => {
    if (!doc) return;

    try {
      await fetch(`/api/docs/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: doc.title,
          content: doc.content,
        }),
      });
    } catch (err) {
      console.error("Failed to save document:", err);
    }
  }, [doc, documentId]);

  // Loading state
  if (isLoading || isSessionLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 flex items-center justify-center"
            animate={{
              scale: [1, 1.05, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Sparkles className="w-8 h-8 text-violet-400" />
          </motion.div>
          <p className="text-sm text-zinc-500">Loading your document...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <span className="text-2xl">😕</span>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">{error}</h2>
          <p className="text-sm text-zinc-500 mb-6">
            The document you&apos;re looking for might have been moved or deleted.
          </p>
          <Link
            href="/dashboard/docs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  // Auth check
  if (!session?.user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Please sign in to edit documents</p>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-sm text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left side */}
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/docs"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                "text-sm text-zinc-400 hover:text-white",
                "hover:bg-white/5 transition-colors"
              )}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Documents</span>
            </Link>
            <span className="w-px h-6 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-lg">{doc?.iconEmoji || "📄"}</span>
              <span className="text-sm text-white font-medium truncate max-w-[200px]">
                {doc?.title || "Untitled Document"}
              </span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Toggle Agent Panel */}
            <button
              onClick={() => setShowAgentPanel(!showAgentPanel)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                "transition-colors",
                showAgentPanel
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              {showAgentPanel ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">AI Panel</span>
            </button>

            {/* Collaborators */}
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                "text-sm text-zinc-400 hover:text-white",
                "hover:bg-white/5 transition-colors"
              )}
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Settings */}
            <button
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "text-zinc-400 hover:text-white hover:bg-white/5",
                "transition-colors"
              )}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - with top padding for fixed header */}
      <main className="pt-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={documentId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <DocumentEditor
              documentId={documentId}
              initialTitle={doc?.title || ""}
              initialContent={doc?.content || ""}
              onTitleChange={handleTitleChange}
              onContentChange={handleContentChange}
              onSave={handleSave}
            />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
