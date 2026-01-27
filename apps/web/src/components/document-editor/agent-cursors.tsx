"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface AgentCursor {
  id: string;
  name: string;
  color: string;
  position: {
    top: number;
    left: number;
  };
  isTyping?: boolean;
}

interface AgentCursorsProps {
  cursors: AgentCursor[];
}

export function AgentCursors({ cursors }: AgentCursorsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      <AnimatePresence>
        {cursors.map((cursor) => (
          <AgentCursorElement key={cursor.id} cursor={cursor} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AgentCursorElement({ cursor }: { cursor: AgentCursor }) {
  return (
    <motion.div
      className="absolute"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        top: cursor.position.top,
        left: cursor.position.left,
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        opacity: { duration: 0.2 },
      }}
    >
      {/* Cursor caret */}
      <div className="relative">
        {/* Main caret line */}
        <motion.div
          className="w-0.5 h-5 rounded-full"
          style={{ backgroundColor: cursor.color }}
          animate={{
            opacity: cursor.isTyping ? [1, 0.3, 1] : 1,
          }}
          transition={{
            duration: 0.5,
            repeat: cursor.isTyping ? Infinity : 0,
            ease: "easeInOut",
          }}
        />

        {/* Typing indicator dots */}
        {cursor.isTyping && (
          <motion.div
            className="absolute -left-1 top-6 flex gap-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: cursor.color }}
                animate={{
                  y: [-1, 1, -1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* Name label */}
        <motion.div
          className={cn(
            "absolute left-1 -top-0.5",
            "px-2 py-0.5 rounded-md rounded-bl-none",
            "text-[10px] font-medium text-white whitespace-nowrap",
            "shadow-lg"
          )}
          style={{ backgroundColor: cursor.color }}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          {cursor.name}
        </motion.div>

        {/* Glow effect */}
        <div
          className="absolute -inset-2 rounded-full blur-md opacity-30"
          style={{ backgroundColor: cursor.color }}
        />

        {/* Selection highlight simulation */}
        {cursor.isTyping && (
          <motion.div
            className="absolute top-0 left-0 h-5 rounded-sm opacity-20"
            style={{ backgroundColor: cursor.color }}
            animate={{
              width: ["0px", "60px", "80px", "60px"],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

// Export a hook to manage cursors
export function useAgentCursors() {
  return {
    // Add cursor
    addCursor: (cursor: AgentCursor) => {
      // Implementation would connect to real-time collaboration
    },
    // Remove cursor
    removeCursor: (id: string) => {
      // Implementation would connect to real-time collaboration
    },
    // Update cursor position
    updatePosition: (id: string, position: { top: number; left: number }) => {
      // Implementation would connect to real-time collaboration
    },
  };
}
