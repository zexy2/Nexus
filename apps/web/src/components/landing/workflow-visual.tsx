"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Sparkles,
  FileText,
  GitPullRequestArrow,
  KanbanSquare,
  History,
  CornerDownLeft,
} from "lucide-react";

/**
 * Hero centrepiece: a self-playing "product film". Inside a sleek window,
 * Nexus keeps a changing plan and delivery work aligned on a loop:
 * edit → compare → review → apply → audit.
 */

const STEP_MS = 2900;
const STEPS = ["edit", "compare", "review", "apply", "history"] as const;

const sceneMeta = [
  { icon: FileText, label: "PLAN · edited once", chapter: "Plan" },
  {
    icon: Sparkles,
    label: "IMPACT · requirements compared",
    chapter: "Impact",
  },
  {
    icon: GitPullRequestArrow,
    label: "REVIEW · human approval",
    chapter: "Review",
  },
  { icon: KanbanSquare, label: "WORK · aligned", chapter: "Board" },
  { icon: History, label: "AUDIT · execution trail", chapter: "Audit" },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

function Bar({ w, dim = false }: { w: string; dim?: boolean }) {
  return (
    <motion.div
      variants={item}
      className={`h-2 rounded-full ${dim ? "bg-white/10" : "bg-white/25"}`}
      style={{ width: w }}
    />
  );
}

function PromptScene() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 font-mono text-[13px] text-white/85">
          <span className="text-white/30">{">"}</span>
          <span>Add guest checkout and remove admin review</span>
          <motion.span
            className="inline-block h-4 w-[2px] bg-white"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-white/40">
        <span>review impact</span>
        <kbd className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono">
          <CornerDownLeft className="size-3" /> enter
        </kbd>
      </div>
    </motion.div>
  );
}

function DocumentScene() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <motion.div
        variants={item}
        className="text-base font-semibold text-white"
      >
        Requirement impact
      </motion.div>
      <div className="space-y-2.5">
        <Bar w="92%" />
        <Bar w="78%" dim />
        <Bar w="85%" dim />
        <Bar w="64%" dim />
      </div>
      <motion.div variants={item} className="grid grid-cols-2 gap-2 pt-1">
        {[
          ["REQ-004", "Guest checkout", "added"],
          ["REQ-007", "Order placement", "modified"],
          ["REQ-009", "Admin review", "removed"],
          ["REQ-012", "Status timeline", "unchanged"],
        ].map(([key, title, state]) => (
          <div
            key={key}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70"
          >
            <span className="mr-2 font-mono text-white/35">{key}</span>
            {title}
            <span className="ml-2 text-white/35">{state}</span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

function TasksScene() {
  const tasks: [string, string][] = [
    ["Create guest checkout task", "Create"],
    ["Update order placement flow", "Update"],
    ["Archive admin review task", "Archive"],
    ["Keep status timeline", "No change"],
  ];
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-2.5"
    >
      {tasks.map(([t, p]) => (
        <motion.div
          key={t}
          variants={item}
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
        >
          <span className="size-4 shrink-0 rounded-[5px] border border-white/25 bg-white/5" />
          <span className="flex-1 truncate text-sm text-white/85">{t}</span>
          <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase text-white/55">
            {p}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function KanbanScene() {
  const cols: [string, string[]][] = [
    ["To do", ["Guest checkout · REQ-004", "Order history · REQ-006"]],
    ["In progress", ["Order placement · REQ-007"]],
    ["Done", ["Registration · REQ-001"]],
  ];
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-3"
    >
      {cols.map(([title, cards]) => (
        <motion.div
          key={title}
          variants={item}
          className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
        >
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-white/40">
            {title}
          </div>
          <div className="space-y-2">
            {cards.map((c) => (
              <div
                key={c}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[11px] leading-tight text-white/75"
              >
                {c}
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function HistoryScene() {
  const rows: [string, string][] = [
    ["plan.version · proposed", "v3"],
    ["impact.analysis · 3 affected", "8.4s"],
    ["human.review · 2 selected", "approved"],
    ["work.alignment · completed", "done"],
  ];
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-2"
    >
      {rows.map(([t, d], i) => (
        <motion.div
          key={t}
          variants={item}
          className="flex items-center gap-3 font-mono text-xs"
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${i === rows.length - 1 ? "bg-white" : "bg-white/40"}`}
          />
          <span className="flex-1 truncate text-white/65">{t}</span>
          <span className="shrink-0 text-white/35">{d}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

const scenes = [
  PromptScene,
  DocumentScene,
  TasksScene,
  KanbanScene,
  HistoryScene,
];

export function WorkflowVisual() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % STEPS.length),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const Scene = scenes[step];
  const Meta = sceneMeta[step].icon;

  return (
    <div className="relative w-full max-w-[30rem]">
      {/* depth glow */}
      <div className="pointer-events-none absolute -inset-28 -z-10 bg-[radial-gradient(closest-side,rgba(255,255,255,0.1),transparent)]" />

      <motion.div
        className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-gradient-to-b from-[#171717] to-[#0e0e0e] shadow-[0_50px_140px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.04]"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* top edge highlight */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">
            nexus / workflow
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase text-white/40">
            <motion.span
              className="size-1.5 rounded-full bg-white"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            live
          </span>
        </div>

        {/* scene step progress */}
        <div className="h-px w-full bg-white/5">
          <motion.div
            key={step}
            className="h-full bg-white/40"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: STEP_MS / 1000, ease: "linear" }}
          />
        </div>

        {/* stage */}
        <div className="relative min-h-[19rem] px-5 py-5">
          <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-white/45">
            <Meta className="size-3.5" />
            {sceneMeta[step].label}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Scene />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* chapter rail */}
        <div className="grid grid-cols-5 border-t border-white/10 bg-white/[0.015]">
          {sceneMeta.map((meta, i) => (
            <button
              key={meta.chapter}
              type="button"
              onClick={() => setStep(i)}
              className={`group relative px-2 py-3 text-left font-mono uppercase transition-colors duration-300 ${
                i === step ? "text-white" : "text-white/30 hover:text-white/60"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="block text-[9px] tracking-[0.24em] opacity-45">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 block truncate text-[10px] tracking-[0.18em]">
                {meta.chapter}
              </span>
              <span className="absolute inset-x-2 bottom-0 h-px overflow-hidden bg-white/10">
                {i === step && (
                  <motion.span
                    key={step}
                    className="block h-full bg-white"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
