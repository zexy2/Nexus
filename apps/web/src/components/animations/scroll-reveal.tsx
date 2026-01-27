"use client";

import { useEffect, useRef, ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  animation?: "fade-up" | "fade-down" | "fade-left" | "fade-right" | "scale" | "blur";
  delay?: number;
  duration?: number;
  threshold?: number;
  stagger?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  className = "",
  animation = "fade-up",
  delay = 0,
  duration = 1,
  threshold = 0.2,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Set initial state based on animation type
    const initialStates: Record<string, gsap.TweenVars> = {
      "fade-up": { opacity: 0, y: 60 },
      "fade-down": { opacity: 0, y: -60 },
      "fade-left": { opacity: 0, x: 60 },
      "fade-right": { opacity: 0, x: -60 },
      scale: { opacity: 0, scale: 0.9 },
      blur: { opacity: 0, filter: "blur(10px)" },
    };

    const finalStates: Record<string, gsap.TweenVars> = {
      "fade-up": { opacity: 1, y: 0 },
      "fade-down": { opacity: 1, y: 0 },
      "fade-left": { opacity: 1, x: 0 },
      "fade-right": { opacity: 1, x: 0 },
      scale: { opacity: 1, scale: 1 },
      blur: { opacity: 1, filter: "blur(0px)" },
    };

    gsap.set(element, initialStates[animation]);

    const trigger = ScrollTrigger.create({
      trigger: element,
      start: `top ${100 - threshold * 100}%`,
      onEnter: () => {
        gsap.to(element, {
          ...finalStates[animation],
          duration,
          delay,
          ease: "power3.out",
        });
      },
      onLeaveBack: once
        ? undefined
        : () => {
            gsap.to(element, {
              ...initialStates[animation],
              duration: duration * 0.5,
              ease: "power3.in",
            });
          },
    });

    return () => {
      trigger.kill();
    };
  }, [animation, delay, duration, threshold, once]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// Staggered reveal for lists/grids
interface StaggerRevealProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  duration?: number;
}

export function StaggerReveal({
  children,
  className = "",
  stagger = 0.1,
  delay = 0,
  duration = 0.8,
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const items = element.children;
    
    gsap.set(items, { opacity: 0, y: 40 });

    const trigger = ScrollTrigger.create({
      trigger: element,
      start: "top 80%",
      onEnter: () => {
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration,
          delay,
          stagger,
          ease: "power3.out",
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, [stagger, delay, duration]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
