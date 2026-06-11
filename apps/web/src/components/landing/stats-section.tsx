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
    label: "Core Steps",
    description: "Document, tasks, Kanban, history",
  },
  {
    value: 1,
    label: "Demo Workspace",
    description: "Single-team portfolio scope",
  },
  {
    value: 2,
    label: "AI Workflows",
    description: "Document generation and task breakdown",
  },
  {
    value: 1,
    label: "Managed Key",
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
      className="relative py-32 md:py-40 bg-white overflow-hidden"
    >
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section header */}
        <ScrollReveal animation="fade-up" className="text-center mb-20">
          <span className="text-sm font-medium tracking-widest uppercase text-neutral-400 mb-4 block">
            Demo Proof
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-black tracking-tight">
            Built to prove the workflow
          </h2>
        </ScrollReveal>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, index) => (
            <ScrollReveal
              key={stat.label}
              animation="fade-up"
              delay={index * 0.1}
              className="text-center group"
            >
              <div className="relative">
                {/* Large number */}
                <div className="text-5xl md:text-6xl lg:text-7xl font-bold text-black tracking-tight mb-2">
                  <span className="text-neutral-300">{stat.prefix}</span>
                  <CountUp
                    end={stat.value}
                    duration={2.5}
                    decimals={stat.value % 1 !== 0 ? 1 : 0}
                    enableScrollSpy
                    scrollSpyOnce
                  />
                  <span className="text-neutral-400">{stat.suffix}</span>
                </div>

                {/* Label */}
                <h3 className="text-lg font-medium text-black mb-1">
                  {stat.label}
                </h3>

                {/* Description */}
                <p className="text-sm text-neutral-500">{stat.description}</p>

                {/* Hover line */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-0 h-px bg-black group-hover:w-16 transition-all duration-500" />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
