"use client";

import Link from "next/link";
import { ArrowRight, Github, ShieldCheck } from "lucide-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { MagneticButton } from "@/components/animations/magnetic-button";

const footerLinks = [
  { href: "#proof", label: "Proof" },
  { href: "#workflow", label: "Workflow" },
  { href: "#stack", label: "Stack" },
  { href: "#demo", label: "Demo Scope" },
  { href: "/login", label: "Demo Login" },
  { href: "https://github.com/zexy2/Nexus", label: "GitHub" },
];

export function FooterMinimal() {
  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a] text-white">
      <section className="relative border-b border-white/10 py-28 md:py-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <ScrollReveal animation="fade-up">
            <span className="mb-5 block font-mono text-sm uppercase text-white/35">
              final check
            </span>
            <h2 className="mx-auto max-w-4xl text-5xl font-semibold leading-none md:text-7xl">
              Change a plan. Review the impact. Approve the work.
            </h2>
          </ScrollReveal>

          <ScrollReveal animation="fade-up" delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/55">
              Nexus keeps the accepted baseline, prepares a controlled change
              set, updates only selected tasks, and records the decision trail.
            </p>
          </ScrollReveal>

          <ScrollReveal animation="fade-up" delay={0.2}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <MagneticButton strength={0.18}>
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-3 bg-white px-8 py-4 text-lg font-semibold text-black transition-colors hover:bg-white/90"
                >
                  Try Demo
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </MagneticButton>

              <MagneticButton strength={0.18}>
                <Link
                  href="https://github.com/zexy2/Nexus"
                  target="_blank"
                  className="inline-flex items-center gap-3 border border-white/15 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-white/10"
                >
                  <Github className="size-5" />
                  View GitHub
                </Link>
              </MagneticButton>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex size-9 items-center justify-center bg-white text-black">
                <span className="font-semibold">N</span>
              </div>
              <span className="text-2xl font-semibold">Nexus</span>
            </Link>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/50">
              A public portfolio demo for controlled plan changes, requirement
              traceability, human approval, and aligned delivery work.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 font-mono text-xs uppercase text-white/35">
              <ShieldCheck className="size-4 text-white" />
              No visitor API key required
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.href.startsWith("https://") ? "_blank" : undefined}
                className="text-white/55 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-sm text-white/35 md:flex-row md:items-center md:justify-between">
          <p>2026 Nexus portfolio demo.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
