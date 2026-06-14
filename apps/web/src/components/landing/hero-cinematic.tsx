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
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const overlay = overlayRef.current;
    const content = contentRef.current;
    if (!hero || !overlay || !content) return;

    const overlayTween = gsap.to(overlay, {
      opacity: 0.9,
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });

    const contentTween = gsap.to(content, {
      scale: 0.96,
      opacity: 0.75,
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "55% top",
        scrub: true,
      },
    });

    return () => {
      overlayTween.kill();
      contentTween.kill();
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-[#0a0a0a]"
    >
      <div className="absolute inset-y-0 right-0 hidden w-[52%] items-center pr-10 lg:flex xl:pr-20">
        <WorkflowVisual />
      </div>

      <div
        ref={overlayRef}
        className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.9)_38%,rgba(0,0,0,0.34)_64%,rgba(0,0,0,0.08)_100%)] max-md:bg-[linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.72)_68%,rgba(0,0,0,0.28)_100%)]"
      />

      <div
        className="pointer-events-none absolute inset-0 z-[2] opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div
        ref={contentRef}
        className="hero-content relative z-10 mx-auto w-full max-w-7xl px-6 py-32 will-change-transform"
      >
        <div className="max-w-[46rem]">
          <div className="mb-8 inline-flex items-center gap-3 border-y border-white/10 py-2">
            <span className="size-2 bg-white shadow-[0_0_18px_rgba(255,255,255,0.45)]" />
            <span className="font-mono text-xs uppercase text-white/55 sm:text-sm">
              Public demo / AI workflow workspace
            </span>
          </div>

          <TextSplitReveal
            text="Nexus"
            className="mt-3 text-7xl font-semibold leading-none text-white sm:text-8xl md:text-9xl"
            type="words"
            animation="mask"
            stagger={0.08}
            triggerOnScroll={false}
            as="h1"
          />

          <div className="mt-5 max-w-[44rem] animate-fade-in-delayed text-4xl font-medium leading-[1.05] text-white/70 sm:text-5xl md:text-6xl">
            turns project ideas into executable workflows.
          </div>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/60 sm:text-xl">
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
      </div>

      <div className="absolute bottom-8 left-6 z-10 hidden items-center gap-4 text-xs uppercase text-white/30 sm:flex">
        <span className="h-px w-20 bg-white/20" />
        Scroll the workflow
      </div>
    </section>
  );
}
