"use client";

import {
  Activity,
  Database,
  Gauge,
  GitBranch,
  LockKeyhole,
  Server,
  Users,
} from "lucide-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

const capabilities = [
  {
    icon: GitBranch,
    label: "Temporal workflows",
    title: "Workflow state is a first-class product surface.",
    description:
      "Document generation and task breakdown run as tracked executions with running, completed, and failed states.",
    proof: ["execution id", "step preview", "terminal status"],
  },
  {
    icon: Database,
    label: "Persistent workspace",
    title: "AI output becomes workspace data.",
    description:
      "Generated documents and extracted tasks are saved to the database so the demo continues beyond a single response.",
    proof: ["docs table", "tasks table", "workspace scope"],
  },
  {
    icon: Gauge,
    label: "Demo guardrails",
    title: "Public access stays budget controlled.",
    description:
      "The app uses a server-managed Gemini key, daily limits, audit logs, and clear unavailable states instead of asking visitors for API keys.",
    proof: ["daily quota", "kill switch", "429 limits"],
  },
  {
    icon: Users,
    label: "Collaboration layer",
    title: "The workspace is built for shared editing.",
    description:
      "Yjs/Hocuspocus collaboration support is part of the stack, while the public demo stays focused on one seeded workspace.",
    proof: ["Yjs", "Hocuspocus", "single demo team"],
  },
  {
    icon: Server,
    label: "Docker VPS path",
    title: "The deployment story is intentionally practical.",
    description:
      "The stack is designed around web, worker, collaboration, Postgres/pgvector, and Temporal services for a small VPS demo.",
    proof: ["compose up", "db:migrate", "smoke:prod"],
  },
  {
    icon: LockKeyhole,
    label: "Honest scope",
    title: "Portfolio demo, not fake enterprise theater.",
    description:
      "The landing explains exactly what is live today and avoids fake testimonials, inflated customer claims, or hidden BYOK assumptions.",
    proof: ["public demo", "no BYOK", "real flow"],
  },
];

export function FeatureBlocks() {
  return (
    <section className="relative overflow-hidden bg-card py-28 text-white md:py-40">
      <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="relative mx-auto max-w-7xl px-6">
        <ScrollReveal animation="fade-up" className="mb-20 max-w-4xl">
          <span className="mb-4 block font-mono text-sm uppercase text-white/35">
            Technical credibility
          </span>
          <h2 className="text-5xl font-semibold leading-none md:text-7xl">
            Built like a small production system, framed as a public demo.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">
            Nexus is interesting because the AI result is not the endpoint. The
            system keeps the document, the tasks, and the execution record.
          </p>
        </ScrollReveal>

        <div className="grid border-y border-white/10 lg:grid-cols-2">
          {capabilities.map((item, index) => {
            const Icon = item.icon;

            return (
              <ScrollReveal
                key={item.label}
                animation="fade-up"
                delay={(index % 2) * 0.08}
                className="border-b border-white/10 py-10 lg:border-r lg:odd:pr-12 lg:even:border-r-0 lg:even:pl-12"
              >
                <div className="mb-6 flex items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <Icon className="size-5 text-white" />
                    <span className="font-mono text-xs uppercase text-white/40">
                      {item.label}
                    </span>
                  </div>
                  <Activity className="size-4 text-white/40" />
                </div>

                <h3 className="max-w-xl text-3xl font-semibold leading-tight">
                  {item.title}
                </h3>
                <p className="mt-4 max-w-xl leading-7 text-white/60">
                  {item.description}
                </p>

                <div className="mt-8 flex flex-wrap gap-2">
                  {item.proof.map((proof) => (
                    <span
                      key={proof}
                      className="border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs uppercase text-white/45"
                    >
                      {proof}
                    </span>
                  ))}
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
