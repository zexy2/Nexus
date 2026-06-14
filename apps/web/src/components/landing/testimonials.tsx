"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Github } from "lucide-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { MagneticButton } from "@/components/animations/magnetic-button";

const demoChecks = [
  "Open the seeded demo account",
  "Generate an AI document from a project prompt",
  "Save the result as a workspace document",
  "Extract tasks from that document",
  "See the tasks on the Kanban board",
  "Inspect workflow history and step output",
];

const scopeNotes = [
  "Public signup is intentionally closed for the demo.",
  "Visitors do not bring their own API keys.",
  "Server-managed Gemini runs behind daily quotas.",
  "AI unavailable states are shown explicitly when limits or provider config fail.",
];

export function Testimonials() {
  return (
    <section className="relative overflow-hidden bg-black py-28 text-white md:py-40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.12),transparent_26%),radial-gradient(circle_at_86%_72%,rgba(245,158,11,0.1),transparent_28%)]" />

      <div className="relative mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <ScrollReveal animation="fade-up">
          <span className="mb-4 block font-mono text-sm uppercase text-white/35">
            Demo scope
          </span>
          <h2 className="text-5xl font-semibold leading-none md:text-7xl">
            A live portfolio demo with clear boundaries.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/55">
            Nexus is not pretending to be a mature SaaS. It is a focused public
            demo that proves one complete AI workspace loop end to end.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <MagneticButton strength={0.18}>
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-3 bg-white px-8 py-4 font-semibold text-black transition-colors hover:bg-white/90"
              >
                Try Nexus demo
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </MagneticButton>

            <MagneticButton strength={0.18}>
              <Link
                href="https://github.com/zexy2/Nexus"
                target="_blank"
                className="inline-flex items-center justify-center gap-3 border border-white/15 px-8 py-4 font-medium text-white transition-colors hover:bg-white/10"
              >
                <Github className="size-5" />
                See source
              </Link>
            </MagneticButton>
          </div>
        </ScrollReveal>

        <div className="grid gap-px bg-white/10">
          <ScrollReveal animation="fade-up" className="bg-black/70 p-6 md:p-8">
            <div className="mb-6 font-mono text-xs uppercase text-white/35">
              recruiter can verify
            </div>
            <div className="space-y-4">
              {demoChecks.map((check) => (
                <div key={check} className="flex items-start gap-3 border-t border-white/10 pt-4">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-white" />
                  <span className="text-lg text-white/80">{check}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal animation="fade-up" delay={0.1} className="bg-black/70 p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3 font-mono text-xs uppercase text-white/35">
              <CircleAlert className="size-4 text-white/60" />
              honest constraints
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {scopeNotes.map((note) => (
                <div key={note} className="border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/60">
                  {note}
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
