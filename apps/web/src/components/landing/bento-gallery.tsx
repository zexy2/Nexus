"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  CheckCircle2,
  FileText,
  GitBranch,
  KanbanSquare,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const stages = [
  {
    eyebrow: "01 / Prompt",
    title: "A project idea enters the system.",
    copy: "The demo starts from a realistic product prompt instead of a blank chat window.",
  },
  {
    eyebrow: "02 / Document",
    title: "Research and writer steps create a saved document.",
    copy: "The output becomes an editable workspace document, not a throwaway response.",
  },
  {
    eyebrow: "03 / Tasks",
    title: "The document becomes structured work.",
    copy: "The task agent extracts titles, descriptions, priorities, and real task records.",
  },
  {
    eyebrow: "04 / Kanban",
    title: "The board becomes the execution surface.",
    copy: "Generated tasks appear where a team would actually plan and move work.",
  },
  {
    eyebrow: "05 / History",
    title: "Every workflow leaves an execution trail.",
    copy: "Running, completed, and failed states stay visible in workflow history.",
  },
];

function PromptArtifact() {
  return (
    <div className="border border-white/10 bg-black/70 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="mb-5 flex items-center gap-3">
        <Sparkles className="size-5 text-white" />
        <span className="font-mono text-xs uppercase text-white/40">
          first input
        </span>
      </div>
      <p className="text-2xl font-medium leading-snug text-white md:text-3xl">
        Build a customer order tracking app with registration, order placement,
        status updates, admin review, and delivery history.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs uppercase text-white/45">
        <span className="border border-white/10 px-3 py-2">Gemini workflow</span>
        <span className="border border-white/10 px-3 py-2">Daily quota</span>
        <span className="border border-white/10 px-3 py-2">Demo account</span>
      </div>
    </div>
  );
}

function DocumentArtifact() {
  return (
    <div className="border border-white/10 bg-card p-6 text-foreground shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <FileText className="size-5" />
          <span className="font-mono text-xs uppercase text-white/45">
            generated document
          </span>
        </div>
        <span className="font-mono text-xs text-white/45">saved to docs</span>
      </div>
      <h3 className="text-3xl font-semibold leading-tight">
        Customer Order Tracking App Specification
      </h3>
      <div className="mt-6 space-y-4 text-sm leading-6 text-white/60">
        <p>
          The application should let customers register, place orders, monitor
          status changes, and review completed delivery history.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {["User accounts", "Order placement", "Status timeline", "Admin review"].map(
            (item) => (
              <div key={item} className="border-t border-white/10 pt-3">
                {item}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function TasksArtifact() {
  const tasks = [
    ["Develop Customer App: User Registration", "High"],
    ["Develop Customer App: Order Placement", "High"],
    ["Create Admin Review Dashboard", "Medium"],
    ["Add Delivery Status Timeline", "Medium"],
  ];

  return (
    <div className="border border-white/10 bg-black/70 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="mb-6 flex items-center gap-3">
        <GitBranch className="size-5 text-white/70" />
        <span className="font-mono text-xs uppercase text-white/40">
          task breakdown
        </span>
      </div>
      <div className="space-y-3">
        {tasks.map(([title, priority]) => (
          <div
            key={title}
            className="flex items-start justify-between gap-4 border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="text-white">{title}</div>
            <span className="shrink-0 bg-white/10 px-2 py-1 font-mono text-xs text-white/70">
              {priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanArtifact() {
  const columns = [
    {
      title: "To do",
      color: "text-white/45",
      tasks: ["Order history", "Customer profile"],
    },
    {
      title: "In progress",
      color: "text-white/70",
      tasks: ["Order placement", "Status tracking"],
    },
    {
      title: "Done",
      color: "text-white",
      tasks: ["Registration flow"],
    },
  ];

  return (
    <div className="border border-white/10 bg-black/70 p-5 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="mb-5 flex items-center gap-3">
        <KanbanSquare className="size-5 text-white" />
        <span className="font-mono text-xs uppercase text-white/40">
          kanban board
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((column) => (
          <div key={column.title} className="min-h-56 border border-white/10 p-3">
            <div className={`mb-3 font-mono text-xs uppercase ${column.color}`}>
              {column.title}
            </div>
            <div className="space-y-3">
              {column.tasks.map((task) => (
                <div key={task} className="border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-sm font-medium text-white">{task}</div>
                  <div className="mt-3 h-px bg-white/10" />
                  <div className="mt-3 font-mono text-xs text-white/35">
                    AI generated
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryArtifact() {
  const rows = [
    ["workflow.start", "running", "00:00"],
    ["research.step", "completed", "00:07"],
    ["writer.output", "completed", "00:18"],
    ["task.agent", "completed", "00:31"],
  ];

  return (
    <div className="border border-white/10 bg-card p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TerminalSquare className="size-5 text-white" />
          <span className="font-mono text-xs uppercase text-white/40">
            workflow history
          </span>
        </div>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-white">
          <CheckCircle2 className="size-4" />
          completed
        </span>
      </div>
      <div className="space-y-3 font-mono text-sm">
        {rows.map(([step, status, time]) => (
          <div key={step} className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-white/10 pt-3">
            <span className="text-white/70">{step}</span>
            <span className={status === "running" ? "text-white/70" : "text-white"}>
              {status}
            </span>
            <span className="text-white/35">{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactForStage({ index }: { index: number }) {
  if (index === 0) return <PromptArtifact />;
  if (index === 1) return <DocumentArtifact />;
  if (index === 2) return <TasksArtifact />;
  if (index === 3) return <KanbanArtifact />;
  return <HistoryArtifact />;
}

export function BentoGallery() {
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>(".artifact-panel");

      gsap.set(items, { opacity: 0, y: 90, rotateX: 5 });

      ScrollTrigger.batch(items, {
        start: "top 82%",
        onEnter: (batch) => {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 1.1,
            stagger: 0.12,
            ease: "power4.out",
          });
        },
      });
    }, gallery);

    return () => ctx.revert();
  }, []);

  return (
    <section className="relative overflow-hidden bg-black py-28 text-white md:py-40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.12),transparent_28%),radial-gradient(circle_at_82%_30%,rgba(255,255,255,0.1),transparent_26%)]" />

      <div ref={galleryRef} className="relative mx-auto max-w-7xl px-6">
        <div className="mb-16 grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[0.72fr_1fr] lg:items-end">
          <div>
            <span className="mb-4 block font-mono text-sm uppercase text-white/35">
              Workflow story
            </span>
            <h2 className="max-w-3xl text-5xl font-semibold leading-none text-white md:text-7xl">
              Idea to execution, without hiding the machine.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white/55 lg:justify-self-end">
            The landing page follows the same loop the demo proves: one prompt,
            one saved document, structured tasks, a Kanban board, and auditable
            workflow status.
          </p>
        </div>

        <div className="space-y-16">
          {stages.map((stage, index) => (
            <article
              key={stage.eyebrow}
              className="artifact-panel grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-12"
            >
              <div className="relative border-t border-white/10 pt-5 lg:border-t-0 lg:border-r lg:pr-8 lg:pt-0">
                <div className="font-mono text-xs uppercase text-white/35">
                  {stage.eyebrow}
                </div>
                <div className="mt-5 hidden h-24 w-px bg-gradient-to-b from-white/70 to-transparent lg:block" />
              </div>

              <div className="min-w-0">
                <div className="mb-5 grid gap-4 md:grid-cols-[0.58fr_1fr] md:items-end">
                  <h3 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
                    {stage.title}
                  </h3>
                  <p className="max-w-2xl text-white/50 md:justify-self-end">
                    {stage.copy}
                  </p>
                </div>
                <ArtifactForStage index={index} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
