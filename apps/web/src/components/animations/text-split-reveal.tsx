"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface TextSplitRevealProps {
  text: string;
  className?: string;
  type?: "chars" | "words" | "lines";
  animation?: "fade" | "slide" | "blur" | "rotate";
  stagger?: number;
  duration?: number;
  delay?: number;
  triggerOnScroll?: boolean;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
}

export function TextSplitReveal({
  text,
  className = "",
  type = "chars",
  animation = "fade",
  stagger = 0.02,
  duration = 0.8,
  delay = 0,
  triggerOnScroll = true,
  as: Component = "div",
}: TextSplitRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Split text into elements
    let elements: HTMLSpanElement[] = [];
    
    if (type === "chars") {
      container.innerHTML = text
        .split("")
        .map((char) =>
          char === " "
            ? "<span class='inline-block'>&nbsp;</span>"
            : `<span class="inline-block">${char}</span>`
        )
        .join("");
      elements = Array.from(container.querySelectorAll("span"));
    } else if (type === "words") {
      container.innerHTML = text
        .split(" ")
        .map((word) => `<span class="inline-block mr-[0.25em]">${word}</span>`)
        .join("");
      elements = Array.from(container.querySelectorAll("span"));
    } else {
      container.innerHTML = text
        .split("\n")
        .map((line) => `<span class="block overflow-hidden"><span class="inline-block">${line}</span></span>`)
        .join("");
      elements = Array.from(container.querySelectorAll("span > span"));
    }

    // Set initial state based on animation
    const initialStates: Record<string, gsap.TweenVars> = {
      fade: { opacity: 0, y: 20 },
      slide: { y: "100%" },
      blur: { opacity: 0, filter: "blur(10px)" },
      rotate: { opacity: 0, rotateX: -90, transformOrigin: "top center" },
    };

    const finalStates: Record<string, gsap.TweenVars> = {
      fade: { opacity: 1, y: 0 },
      slide: { y: "0%" },
      blur: { opacity: 1, filter: "blur(0px)" },
      rotate: { opacity: 1, rotateX: 0 },
    };

    gsap.set(elements, initialStates[animation]);

    const animateIn = () => {
      if (hasAnimated.current && triggerOnScroll) return;
      hasAnimated.current = true;

      gsap.to(elements, {
        ...finalStates[animation],
        duration,
        delay,
        stagger,
        ease: animation === "slide" ? "power4.out" : "power3.out",
      });
    };

    if (triggerOnScroll) {
      const trigger = ScrollTrigger.create({
        trigger: container,
        start: "top 85%",
        onEnter: animateIn,
      });

      return () => {
        trigger.kill();
      };
    } else {
      // Animate immediately
      const timeout = setTimeout(animateIn, delay * 1000);
      return () => clearTimeout(timeout);
    }
  }, [text, type, animation, stagger, duration, delay, triggerOnScroll]);

  return (
    <Component ref={containerRef as React.RefObject<HTMLDivElement>} className={className}>
      {text}
    </Component>
  );
}

// Simple word-by-word reveal
interface WordRevealProps {
  text: string;
  className?: string;
  highlightWords?: string[];
  highlightClassName?: string;
}

export function WordReveal({
  text,
  className = "",
  highlightWords = [],
  highlightClassName = "text-foreground",
}: WordRevealProps) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const words = element.querySelectorAll("span");
    gsap.set(words, { opacity: 0, y: 20 });

    const trigger = ScrollTrigger.create({
      trigger: element,
      start: "top 80%",
      onEnter: () => {
        gsap.to(words, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.05,
          ease: "power3.out",
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <p ref={ref} className={className}>
      {text.split(" ").map((word, i) => {
        const isHighlighted = highlightWords.includes(word.toLowerCase());
        return (
          <span
            key={i}
            className={`inline-block mr-[0.3em] ${isHighlighted ? highlightClassName : ""}`}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
}
