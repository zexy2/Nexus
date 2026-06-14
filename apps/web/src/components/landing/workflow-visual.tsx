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
 * Hero visual: the actual product flow rendered as a living pipeline —
 * Idea → Document → Tasks → Kanban → History — with a glowing "data" comet
 * travelling the line, nodes lighting up in sequence, soft depth glow and a
 * gentle float. Premium feel, but meaning-led and uncluttered. Pure
 * CSS/framer-motion (no WebGL).
 */

const stages = [
  { icon: Lightbulb, label: "Idea", detail: "“Build a customer order app”" },
  { icon: FileText, label: "Document", detail: "Spec generated · saved to docs" },
  { icon: CheckSquare, label: "Tasks", detail: "8 tasks extracted" },
  { icon: KanbanSquare, label: "Kanban", detail: "To do · In progress · Done" },
  { icon: History, label: "History", detail: "Every step tracked" },
];

const LOOP = 4.6; // seconds for one full comet pass (down + back)

export function WorkflowVisual() {
  return (
    <motion.div
      className="relative w-full max-w-[26rem]"
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* depth — soft radial glow behind the pipeline */}
      <div className="pointer-events-none absolute -inset-20 -z-10 bg-[radial-gradient(closest-side,rgba(255,255,255,0.07),transparent)]" />

      {/* connector line */}
      <div className="absolute left-8 top-10 bottom-10 w-px -translate-x-1/2 bg-gradient-to-b from-white/5 via-white/20 to-white/5" />

      {/* travelling data comet (glow halo + bright core) */}
      <motion.div
        aria-hidden
        className="absolute left-8 -translate-x-1/2"
        initial={{ top: "2.5rem" }}
        animate={{ top: ["2.5rem", "calc(100% - 4rem)", "2.5rem"] }}
        transition={{ duration: LOOP, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_4px_rgba(255,255,255,0.7)]" />
      </motion.div>

      {/* nodes */}
      <div className="relative space-y-4">
        {stages.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: 36, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.35 + i * 0.13, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4"
          >
            {/* icon tile (floats subtly, lights up as the comet passes) */}
            <motion.div
              className="relative z-10 flex size-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-sm"
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
            >
              <s.icon className="size-5 text-white/85" />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-2xl ring-1 ring-white/70 shadow-[0_0_28px_rgba(255,255,255,0.3)]"
                animate={{ opacity: [0, 0, 0.9, 0, 0] }}
                transition={{ duration: LOOP, repeat: Infinity, ease: "easeInOut", delay: i * 0.42 }}
              />
            </motion.div>

            {/* card — gradient hairline + elevation */}
            <div className="min-w-0 flex-1 rounded-2xl bg-gradient-to-b from-white/[0.14] to-white/[0.04] p-px shadow-[0_24px_70px_-28px_rgba(0,0,0,0.9)]">
              <div className="rounded-[15px] bg-[#111111] px-4 py-3.5">
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="mt-0.5 truncate text-xs text-white/45">{s.detail}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
