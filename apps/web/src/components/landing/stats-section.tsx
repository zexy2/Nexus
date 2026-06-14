"use client";

import { useEffect, useRef } from "react";
import CountUp from "react-countup";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  description: string;
}

const stats: Stat[] = [
  {
    value: 4,
    label: "Proof points",
    description: "Document, tasks, board, history",
  },
  {
    value: 1,
    label: "Demo account",
    description: "No user API key required",
  },
  {
    value: 2,
    label: "AI workflows",
    description: "Document generation and task breakdown",
  },
  {
    value: 1,
    label: "Managed key",
    description: "Server-side Gemini with quotas",
  },
];

export function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      onEnter: () => {
        if (!hasTriggered.current) {
          hasTriggered.current = true;
          // Trigger count animation by updating state
          section.classList.add("stats-visible");
        }
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-card py-28 md:py-36"
    >
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">
        <ScrollReveal animation="fade-up" className="mb-16 max-w-3xl">
          <span className="text-sm font-medium tracking-widest uppercase text-neutral-400 mb-4 block">
            Demo proof
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white text-balance">
            The landing page proves the exact loop the recruiter can run.
          </h2>
        </ScrollReveal>

        <div className="grid gap-px bg-white/10 md:grid-cols-4">
          {stats.map((stat, index) => (
            <ScrollReveal
              key={stat.label}
              animation="fade-up"
              delay={index * 0.1}
              className="group bg-card p-6 md:p-8"
            >
              <div className="relative">
                <div className="mb-6 text-5xl font-semibold text-white md:text-6xl lg:text-7xl">
                  <span className="text-neutral-300">{stat.prefix}</span>
                  <CountUp
                    end={stat.value}
                    duration={2.5}
                    decimals={stat.value % 1 !== 0 ? 1 : 0}
                    enableScrollSpy
                    scrollSpyOnce
                  />
                  <span className="text-white/40">{stat.suffix}</span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-1">
                  {stat.label}
                </h3>

                <p className="text-sm text-neutral-500">{stat.description}</p>

                <div className="mt-8 h-px w-0 bg-white transition-all duration-500 group-hover:w-20" />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
