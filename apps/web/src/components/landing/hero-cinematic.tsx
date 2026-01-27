"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { TextSplitReveal } from "@/components/animations/text-split-reveal";
import { MagneticButton } from "@/components/animations/magnetic-button";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function HeroCinematic() {
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const overlay = overlayRef.current;
    if (!hero || !overlay) return;

    // Parallax effect on scroll
    gsap.to(overlay, {
      opacity: 0.8,
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });

    // Scale hero content on scroll
    const content = hero.querySelector(".hero-content");
    if (content) {
      gsap.to(content, {
        scale: 0.95,
        opacity: 0.8,
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "50% top",
          scrub: true,
        },
      });
    }
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black"
    >
      {/* Background Video/Image */}
      <div className="absolute inset-0">
        {/* Fallback gradient background for when video fails */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/50 via-black to-black" />
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          suppressHydrationWarning
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          poster="https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=90"
          onError={(e) => {
            // Hide video on error, fallback gradient will show
            (e.target as HTMLVideoElement).style.display = 'none';
          }}
        >
          {/* Use a more reliable source or local video */}
          <source
            src="/videos/hero-bg.mp4"
            type="video/mp4"
          />
        </video>
        {/* Gradient overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black"
        />
      </div>

      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="hero-content relative z-10 max-w-6xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
          <span className="size-2 rounded-full bg-white animate-pulse" />
          <span className="text-sm text-white/70">AI-Powered Workspace</span>
        </div>

        {/* Main headline */}
        <TextSplitReveal
          text="Build faster with"
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-light text-white tracking-tight mb-2"
          type="words"
          animation="fade"
          stagger={0.08}
          triggerOnScroll={false}
          as="h1"
        />
        <TextSplitReveal
          text="intelligent agents"
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold text-white tracking-tight"
          type="words"
          animation="fade"
          stagger={0.08}
          delay={0.3}
          triggerOnScroll={false}
          as="h1"
        />

        {/* Subtitle */}
        <p className="mt-8 text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed animate-fade-in-delayed">
          Nexus combines autonomous AI agents with a local-first database.
          <br className="hidden sm:block" />
          Your data stays private. Your workflow stays fast.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12 animate-fade-in-delayed-2">
          <MagneticButton strength={0.2}>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-medium text-lg hover:bg-white/90 transition-colors"
            >
              Start Building
              <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </MagneticButton>

          <MagneticButton strength={0.2}>
            <Link
              href="#demo"
              className="group inline-flex items-center gap-3 px-8 py-4 border border-white/20 text-white rounded-full font-medium text-lg hover:bg-white/10 transition-colors"
            >
              <Play className="size-5" />
              Watch Demo
            </Link>
          </MagneticButton>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce-slow">
        <span className="text-xs text-white/40 uppercase tracking-widest">Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </section>
  );
}
