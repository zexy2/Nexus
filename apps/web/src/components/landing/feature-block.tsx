"use client";

import {
  Activity,
  BadgeCheck,
  FileClock,
  Gauge,
  GitBranch,
  GitCompareArrows,
  LockKeyhole,
  Server,
} from "lucide-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

const capabilities = [
  {
    icon: FileClock,
    label: "Versioned plans",
    title: "A plan edit never destroys the accepted baseline.",
    description:
      "Nexus stores immutable plan versions and stable requirement IDs so changes can be compared instead of silently overwriting the source of truth.",
    proof: ["plan versions", "REQ-001", "accepted baseline"],
  },
  {
    icon: GitCompareArrows,
    label: "Impact graph",
    title: "Every changed requirement is traced to delivery work.",
    description:
      "Added, modified, and removed requirements are matched against linked tasks to expose stale work, missing coverage, and orphaned tasks.",
    proof: ["requirement links", "coverage", "needs review"],
  },
  {
    icon: BadgeCheck,
    label: "Human approval",
    title: "AI prepares a change set. It does not rewrite the board.",
    description:
      "Users select task creates, updates, archives, and relinks one by one. Only approved proposals are applied inside a transaction.",
    proof: ["selective apply", "no hard delete", "audit event"],
  },
  {
    icon: GitBranch,
    label: "Durable workflow",
    title: "Analysis and approval remain visible as one execution.",
    description:
      "Temporal tracks analysis, waits for the review decision, applies selected changes, and records completed or failed states.",
    proof: ["durable wait", "workflow id", "terminal status"],
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
            AI proposes. People decide. Work stays traceable.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">
            Nexus is not another chat window. It is a controlled layer between
            a changing project plan and the work that must remain aligned with it.
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
