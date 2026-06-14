"use client";

import { motion } from "framer-motion";
import {
  Lightbulb,
  FileText,
  CheckSquare,
  KanbanSquare,
  History,
} from "lucide-react";

/**
 * Monochrome, meaning-led hero visual. Instead of an abstract 3D ribbon, it
 * shows the actual product flow — an idea becoming a document, tasks, a kanban
 * board and a tracked execution history — as a vertical pipeline with a pulse
 * of "data" travelling between the steps. Pure CSS/motion (no WebGL).
 */

const stages = [
  { icon: Lightbulb, label: "Idea", detail: "“Build a customer order app”" },
  { icon: FileText, label: "Document", detail: "Spec generated · saved to docs" },
  { icon: CheckSquare, label: "Tasks", detail: "8 tasks extracted" },
  { icon: KanbanSquare, label: "Kanban", detail: "To do · In progress · Done" },
  { icon: History, label: "History", detail: "Every step tracked" },
];

export function WorkflowVisual() {
  return (
    <div className="relative w-full max-w-sm select-none">
      {/* connector line behind the nodes */}
      <div className="absolute left-[27px] top-10 bottom-10 w-px bg-white/10" />

      {/* a pulse of data travelling down the pipeline */}
      <motion.div
        aria-hidden
        className="absolute left-[27px] h-12 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/80 to-transparent"
        initial={{ top: "2.5rem" }}
        animate={{ top: ["2.5rem", "calc(100% - 5rem)"] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative space-y-4">
        {stages.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.5, ease: "easeOut" }}
            className="flex items-center gap-4"
          >
            <div className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card">
              <s.icon className="size-5 text-white/85" />
              {/* node breathes subtly, staggered, to imply sequential execution */}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-xl ring-1 ring-white/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.9, 0] }}
                transition={{
                  duration: 3.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [0, 0.5, 1],
                  delay: i * 0.6,
                }}
              />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-sm font-medium text-white">{s.label}</p>
              <p className="truncate text-xs text-white/45">{s.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
