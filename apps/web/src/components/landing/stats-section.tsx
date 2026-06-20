"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
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
    label: "Control points",
    description: "Version, impact, approval, alignment",
  },
  {
    value: 1,
    label: "Approval gate",
    description: "AI proposes; a person decides",
  },
  {
    value: 3,
    label: "Traceable links",
    description: "Plan, requirement, delivery task",
  },
  {
    value: 1,
    label: "Durable review",
    description: "Pending decisions survive restarts",
  },
];

export function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(
          [
            ".stat-rule-vertical",
            ".stat-rule-horizontal",
            ".stat-number",
            ".stat-copy",
            ".stat-accent",
          ],
          { clearProps: "all" }
        );
        return;
      }

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top 72%",
          once: true,
        },
      });

      timeline
        .fromTo(
          ".stat-rule-vertical",
          { scaleY: 0 },
          {
            scaleY: 1,
            duration: 0.8,
            stagger: 0.07,
            ease: "power3.out",
          }
        )
        .fromTo(
          ".stat-rule-horizontal",
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.8,
            stagger: 0.07,
            ease: "power3.out",
          },
          0
        )
        .fromTo(
          ".stat-number",
          { yPercent: 110 },
          {
            yPercent: 0,
            duration: 0.85,
            stagger: 0.08,
            ease: "power4.out",
          },
          0.08
        )
        .fromTo(
          ".stat-copy",
          { y: 16, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.08,
            ease: "power3.out",
          },
          0.22
        )
        .fromTo(
          ".stat-accent",
          { scaleX: 0, opacity: 0 },
          {
            scaleX: 1,
            opacity: 1,
            duration: 0.55,
            stagger: 0.08,
            ease: "power3.out",
          },
          0.38
        );
    },
    { scope: sectionRef }
  );

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
            Change control
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white text-balance">
            Change the plan once. Keep delivery work aligned.
          </h2>
        </ScrollReveal>

        <div className="grid border-y border-white/10 md:grid-cols-4">
          {stats.map((stat, index) => (
            <article
              key={stat.label}
              className="group relative flex min-h-72 flex-col px-1 py-8 md:min-h-80 md:px-8 md:py-10"
            >
              {index > 0 && (
                <>
                  <div className="stat-rule-horizontal absolute inset-x-0 top-0 h-px origin-left bg-white/10 md:hidden" />
                  <div className="stat-rule-vertical absolute inset-y-0 left-0 hidden w-px origin-top bg-white/10 md:block" />
                </>
              )}

              <div className="overflow-hidden pb-2">
                <div className="stat-number text-5xl font-semibold text-white will-change-transform md:text-6xl lg:text-7xl">
                  <span className="text-neutral-300">{stat.prefix}</span>
                  {stat.value}
                  <span className="text-white/40">{stat.suffix}</span>
                </div>
              </div>

              <div className="stat-copy mt-auto will-change-transform">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {stat.label}
                </h3>

                <p className="max-w-56 text-sm leading-relaxed text-neutral-500">
                  {stat.description}
                </p>
              </div>

              <div className="stat-accent mt-7 h-px w-10 origin-left bg-white/30 transition-[width,background-color] duration-300 group-hover:w-16 group-hover:bg-white/60" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
