"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { TextSplitReveal } from "@/components/animations/text-split-reveal";
import { MagneticButton } from "@/components/animations/magnetic-button";
import { WorkflowVisual } from "@/components/landing/workflow-visual";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function HeroCinematic() {
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const content = contentRef.current;
    if (!hero || !content) return;

    const contentTween = gsap.to(content, {
      scale: 0.97,
      opacity: 0.7,
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "55% top",
        scrub: true,
      },
    });

    return () => {
      contentTween.kill();
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-[#0a0a0a]"
    >
      <div
        ref={contentRef}
        className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-28 will-change-transform lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] lg:gap-16"
      >
        {/* Left — copy */}
        <div>
          <div className="mb-8 inline-flex items-center gap-3 border-y border-white/10 py-2">
            <span className="size-2 bg-white shadow-[0_0_18px_rgba(255,255,255,0.45)]" />
            <span className="font-mono text-xs uppercase text-white/55 sm:text-sm">
              Public demo / AI workflow workspace
            </span>
          </div>

          <TextSplitReveal
            text="Nexus"
            className="mt-3 text-7xl font-semibold leading-none text-white sm:text-8xl"
            type="words"
            animation="mask"
            stagger={0.08}
            triggerOnScroll={false}
            as="h1"
          />

          <div className="mt-5 animate-fade-in-delayed text-4xl font-medium leading-[1.05] text-white/70 sm:text-5xl">
            turns project ideas into executable workflows.
          </div>

          <p className="mt-7 max-w-xl text-lg leading-8 text-white/60">
            Generate a document, extract tasks, manage the Kanban board, and
            inspect every AI workflow step behind it.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <MagneticButton strength={0.18}>
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-3 bg-white px-8 py-4 text-base font-semibold text-black transition-colors hover:bg-white/90"
              >
                Try the demo
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </MagneticButton>

            <MagneticButton strength={0.18}>
              <Link
                href="https://github.com/zexy2/Nexus"
                target="_blank"
                className="inline-flex items-center justify-center gap-3 border border-white/15 px-8 py-4 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                <Github className="size-5" />
                View GitHub
              </Link>
            </MagneticButton>
          </div>
        </div>

        {/* Right — self-playing workflow film */}
        <div className="hidden justify-end lg:flex">
          <WorkflowVisual />
        </div>
      </div>

      <div className="absolute bottom-8 left-6 z-10 hidden items-center gap-4 text-xs uppercase text-white/30 sm:flex">
        <span className="h-px w-20 bg-white/20" />
        Scroll the workflow
      </div>
    </section>
  );
}
