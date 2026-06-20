"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const BOOT_STEPS = [
  "INDEXING PLAN VERSION",
  "EXTRACTING REQ-001",
  "LINKING TASK GRAPH",
  "PREPARING IMPACT REVIEW",
];

const GRAPH_NODES = [
  { label: "PLAN", className: "left-1/2 top-[18%] -translate-x-1/2" },
  { label: "REQ-001", className: "left-[16%] top-[48%]" },
  { label: "REQ-002", className: "right-[16%] top-[48%]" },
  { label: "TASK", className: "left-[27%] bottom-[16%]" },
  { label: "APPROVAL", className: "right-[20%] bottom-[16%]" },
];

export function Preloader({ onComplete }: { onComplete?: () => void }) {
  const [shouldRender, setShouldRender] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const nexusRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const hasRun = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const visited = sessionStorage.getItem("nexus-preloader-visited");
    if (visited) {
      setShouldRender(false);
      onComplete?.();
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      sessionStorage.setItem("nexus-preloader-visited", "1");
      setShouldRender(false);
      onComplete?.();
      return;
    }

    // Lock scroll
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [onComplete]);

  useEffect(() => {
    if (!shouldRender || hasRun.current) return;
    if (
      !overlayRef.current ||
      !counterRef.current ||
      !progressRef.current ||
      !nexusRef.current ||
      !contentRef.current ||
      !graphRef.current
    )
      return;

    hasRun.current = true;

    const counter = { value: 0 };
    const bootLines = contentRef.current.querySelectorAll(".boot-line");
    const graphNodes = graphRef.current.querySelectorAll(".graph-node");
    const graphLines = graphRef.current.querySelectorAll(".graph-line");
    const nexusLetters = nexusRef.current.querySelectorAll(".nexus-letter");
    const nexusTagline = nexusRef.current.querySelector(".nexus-tagline");

    const glowTween = glowRef.current
      ? gsap.to(glowRef.current, {
          opacity: 0.42,
          scale: 1.18,
          duration: 1.15,
          ease: "sine.inOut",
          yoyo: true,
          repeat: 2,
        })
      : null;

    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        document.body.style.overflow = "";
        sessionStorage.setItem("nexus-preloader-visited", "1");
        setShouldRender(false);
        onComplete?.();
      },
    });

    // 0.0 - 1.9s: Counter animates 0 -> 100 while boot lines remain readable.
    tl.to(
      counter,
      {
        value: 100,
        duration: 1.9,
        ease: "power2.inOut",
        onUpdate: () => {
          if (counterRef.current) {
            counterRef.current.textContent = `${Math.round(counter.value)}%`;
          }
        },
      },
      0,
    );

    tl.to(
      progressRef.current,
      {
        scaleX: 1,
        duration: 1.9,
        ease: "power2.inOut",
      },
      0,
    );

    tl.fromTo(
      bootLines,
      { opacity: 0, y: 12, filter: "blur(6px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.45,
        stagger: 0.2,
      },
      0.22,
    );

    tl.to(
      bootLines,
      {
        opacity: 0.28,
        duration: 0.25,
        stagger: 0.04,
        ease: "power2.in",
      },
      1.58,
    );

    // 1.9s - 2.8s: Brief product graph appears: plan -> requirements -> task approval.
    tl.to(
      contentRef.current,
      {
        opacity: 0,
        scale: 0.98,
        duration: 0.22,
        ease: "power2.out",
      },
      1.88,
    );

    tl.set(graphRef.current, { display: "block" }, 1.98);

    tl.fromTo(
      graphLines,
      { scaleX: 0, opacity: 0, transformOrigin: "left center" },
      {
        scaleX: 1,
        opacity: 0.32,
        duration: 0.38,
        stagger: 0.08,
        ease: "power2.out",
      },
      2.04,
    );

    tl.fromTo(
      graphNodes,
      { opacity: 0, scale: 0.82, y: 10, filter: "blur(8px)" },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.44,
        stagger: 0.1,
      },
      2.04,
    );

    tl.to(
      graphRef.current,
      {
        opacity: 0,
        scale: 1.04,
        duration: 0.22,
        ease: "power2.in",
      },
      2.78,
    );

    // 3.0s: "NEXUS" text appears with blur-to-sharp and a light sweep.
    tl.set(nexusRef.current, { display: "flex" }, 3.02);

    tl.fromTo(
      nexusLetters,
      {
        opacity: 0,
        y: 28,
        filter: "blur(12px)",
        letterSpacing: "0.55em",
      },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        letterSpacing: "0.3em",
        duration: 0.72,
        stagger: 0.07,
        ease: "power4.out",
      },
      3.02,
    );

    if (nexusTagline) {
      tl.fromTo(
        nexusTagline,
        { opacity: 0, y: 10, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.34,
        },
        3.46,
      );
    }

    if (sweepRef.current) {
      tl.fromTo(
        sweepRef.current,
        { xPercent: -130, opacity: 0 },
        {
          xPercent: 130,
          opacity: 1,
          duration: 0.88,
          ease: "power3.inOut",
        },
        3.38,
      );
    }

    // 4.35s: Cinematic split reveal into the hero after users have time to read.
    tl.to(
      nexusRef.current,
      {
        opacity: 0,
        y: -18,
        duration: 0.36,
        ease: "power2.in",
      },
      4.35,
    );

    tl.to(
      overlayRef.current,
      {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.9,
        ease: "power4.inOut",
      },
      4.48,
    );

    return () => {
      glowTween?.kill();
      tl.kill();
      document.body.style.overflow = "";
    };
  }, [shouldRender, onComplete]);

  if (!shouldRender) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ clipPath: "inset(0 0 0 0)" }}
      aria-hidden="true"
    >
      {/* Solid black background */}
      <div className="absolute inset-0 bg-black" />

      {/* Subtle masked grid that matches the landing hero language */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.72)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_58%_58%_at_50%_45%,black,transparent)] [-webkit-mask-image:radial-gradient(ellipse_58%_58%_at_50%_45%,black,transparent)]" />

      {/* Grain texture overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.045,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Counter + boot sequence content */}
      <div
        ref={contentRef}
        className="absolute inset-0 flex flex-col items-center justify-center px-6"
      >
        {/* Ambient glow behind counter */}
        <div
          ref={glowRef}
          className="pointer-events-none absolute"
          style={{
            width: "clamp(300px, 42vw, 620px)",
            height: "clamp(300px, 42vw, 620px)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 42%, transparent 70%)",
            opacity: 0.18,
            filter: "blur(44px)",
          }}
        />

        <span className="mb-5 font-mono text-[0.64rem] uppercase tracking-[0.42em] text-white/35">
          Nexus boot sequence
        </span>

        {/* Percentage counter — MASSIVE */}
        <span
          ref={counterRef}
          className="block select-none font-mono tabular-nums tracking-tight"
          style={{
            fontSize: "clamp(6rem, 15vw, 12rem)",
            fontWeight: 200,
            color: "#fafafa",
            lineHeight: 1,
          }}
        >
          0%
        </span>

        <div className="mt-8 grid w-full max-w-[26rem] gap-2 font-mono text-[0.64rem] uppercase tracking-[0.28em] text-white/45 sm:grid-cols-2">
          {BOOT_STEPS.map((step) => (
            <div
              key={step}
              className="boot-line border border-white/10 bg-white/[0.025] px-3 py-2"
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      {/* Product graph flash */}
      <div
        ref={graphRef}
        className="absolute left-1/2 top-1/2 hidden aspect-[1.5/1] w-[min(84vw,560px)] -translate-x-1/2 -translate-y-1/2"
        style={{ opacity: 1 }}
      >
        <div className="graph-line absolute left-[50%] top-[26%] h-px w-[28%] rotate-[148deg] bg-white/70" />
        <div className="graph-line absolute right-[50%] top-[26%] h-px w-[28%] rotate-[32deg] bg-white/70" />
        <div className="graph-line absolute left-[24%] top-[59%] h-px w-[22%] rotate-[52deg] bg-white/70" />
        <div className="graph-line absolute right-[26%] top-[59%] h-px w-[24%] rotate-[-48deg] bg-white/70" />
        {GRAPH_NODES.map((node) => (
          <div
            key={node.label}
            className={`graph-node absolute ${node.className} border border-white/15 bg-black/60 px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-white/75 shadow-[0_0_28px_rgba(255,255,255,0.08)] backdrop-blur`}
          >
            {node.label}
          </div>
        ))}
      </div>

      {/* Full-width bottom progress bar */}
      <div className="absolute bottom-0 left-0 h-[3px] w-full overflow-hidden bg-white/10">
        <div
          ref={progressRef}
          className="h-full w-full origin-left"
          style={{
            backgroundColor: "#fafafa",
            transform: "scaleX(0)",
          }}
        />
      </div>

      {/* NEXUS text (hidden initially, shown after counter fades) */}
      <div
        ref={nexusRef}
        className="absolute inset-0 hidden flex-col items-center justify-center overflow-hidden"
        style={{ opacity: 1 }}
      >
        <div className="relative overflow-hidden px-8 py-3">
          <div
            ref={sweepRef}
            className="pointer-events-none absolute inset-y-0 left-1/2 w-24 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent blur-sm"
          />
          <div className="flex items-center justify-center">
            {"NEXUS".split("").map((letter, i) => (
              <span
                key={i}
                className="nexus-letter inline-block select-none text-2xl font-extralight uppercase text-white md:text-4xl"
                style={{
                  letterSpacing: "0.3em",
                  opacity: 0,
                }}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>
        <span className="nexus-tagline mt-4 font-mono text-[0.62rem] uppercase tracking-[0.42em] text-white/38">
          Change propagation engine
        </span>
      </div>
    </div>
  );
}
