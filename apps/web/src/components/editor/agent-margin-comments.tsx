"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Check, Loader2, AlertCircle, Bot } from "lucide-react";

export interface AgentComment {
  id: string;
  agentName: string;
  agentColor: string;
  message: string;
  status: "loading" | "complete" | "error";
  lineNumber: number;
}

interface AgentMarginCommentsProps {
  comments: AgentComment[];
  onDismiss: (id: string) => void;
}

export function AgentMarginComments({
  comments,
  onDismiss,
}: AgentMarginCommentsProps) {
  // Sort comments by line number
  const sortedComments = [...comments].sort(
    (a, b) => a.lineNumber - b.lineNumber
  );

  return (
    <div className="w-80 border-l border-white/5 bg-zinc-950/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-medium text-white">Agent Activity</span>
          <span className="ml-auto text-xs text-zinc-500 font-mono">
            {comments.length}
          </span>
        </div>
      </div>

      {/* Comments List */}
      <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
        <AnimatePresence mode="popLayout">
          {sortedComments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-8 text-center"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 flex items-center justify-center">
                <Bot className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">No agent activity</p>
              <p className="text-xs text-zinc-600 mt-1">
                AI agents will show their thoughts here
              </p>
            </motion.div>
          ) : (
            sortedComments.map((comment, index) => (
              <motion.div
                key={comment.id}
                layout
                initial={{ opacity: 0, x: 50, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 40,
                  delay: index * 0.05,
                }}
              >
                <AgentCommentCard comment={comment} onDismiss={onDismiss} />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AgentCommentCard({
  comment,
  onDismiss,
}: {
  comment: AgentComment;
  onDismiss: (id: string) => void;
}) {
  const statusIcon = {
    loading: (
      <Loader2
        className="w-3.5 h-3.5 animate-spin"
        style={{ color: comment.agentColor }}
      />
    ),
    complete: <Check className="w-3.5 h-3.5 text-emerald-400" />,
    error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  };

  return (
    <div
      className={cn(
        "relative group rounded-xl overflow-hidden",
        "bg-white/[0.03] hover:bg-white/[0.05]",
        "border border-white/5",
        "transition-all duration-200"
      )}
    >
      {/* Colored accent line */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: comment.agentColor }}
      />

      {/* Content */}
      <div className="p-3 pl-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ backgroundColor: `${comment.agentColor}20` }}
            >
              <Bot
                className="w-3 h-3"
                style={{ color: comment.agentColor }}
              />
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: comment.agentColor }}
            >
              {comment.agentName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center",
                comment.status === "complete" && "bg-emerald-500/20",
                comment.status === "error" && "bg-red-500/20",
                comment.status === "loading" && "bg-white/5"
              )}
            >
              {statusIcon[comment.status]}
            </div>
            <button
              onClick={() => onDismiss(comment.id)}
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center",
                "opacity-0 group-hover:opacity-100",
                "hover:bg-white/10 transition-all"
              )}
            >
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-zinc-300 leading-relaxed">
          {comment.message}
        </p>

        {/* Line reference */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600 font-mono">
            Line {comment.lineNumber}
          </span>
          {comment.status === "loading" && (
            <motion.div
              className="flex gap-0.5"
              initial="hidden"
              animate="visible"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 rounded-full bg-zinc-500"
                  animate={{
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Pulse effect for loading state */}
      {comment.status === "loading" && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${comment.agentColor}10, transparent)`,
          }}
          animate={{
            x: ["-100%", "200%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      )}
    </div>
  );
}
