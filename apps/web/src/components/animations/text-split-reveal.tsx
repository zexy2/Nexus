"use client";

import { useEffect, useRef, useCallback } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface TextSplitRevealProps {
  text: string;
  className?: string;
  type?: "chars" | "words" | "lines";
  animation?: "fade" | "slide" | "blur" | "rotate" | "mask" | "scramble";
  stagger?: number;
  duration?: number;
  delay?: number;
  triggerOnScroll?: boolean;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

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

  const runScrambleAnimation = useCallback((container: HTMLElement, animDelay: number) => {
    const chars = text.split("");
    const totalDuration = 1.5; // seconds
    const perCharDuration = 0.06;
    const staggerAmount = totalDuration / Math.max(chars.length, 1);

    // Build spans for each character
    container.innerHTML = chars
      .map((char) =>
        char === " "
          ? "<span class='inline-block'>&nbsp;</span>"
          : `<span class="inline-block" data-final="${char}">${SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]}</span>`
      )
      .join("");

    const spans = Array.from(container.querySelectorAll("span")) as HTMLSpanElement[];

    spans.forEach((span, index) => {
      const finalChar = chars[index];
      if (finalChar === " ") return;

      const charDelay = animDelay + index * staggerAmount + (Math.random() * 0.05);
      const scrambleCycles = Math.floor(perCharDuration * 1000 / 50) + 3;
      let cycle = 0;

      const intervalId = window.setTimeout(() => {
        const interval = setInterval(() => {
          cycle++;
          if (cycle >= scrambleCycles) {
            clearInterval(interval);
            span.textContent = finalChar;
            span.style.opacity = "1";
          } else {
            span.textContent = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }, 50);
      }, charDelay * 1000);

      // Set initial scrambled state
      span.style.opacity = "0.4";

      // Fade in quickly
      gsap.to(span, {
        opacity: 1,
        duration: 0.3,
        delay: charDelay,
      });
    });
  }, [text]);

  const runMaskAnimation = useCallback((container: HTMLElement, animDelay: number, animDuration: number) => {
    // Split text into lines (use words if single line, or split by \n)
    const lines = text.includes("\n") ? text.split("\n") : text.split(" ").reduce<string[]>((acc, word) => {
      // For single-line text, treat each word as a "line" for the mask effect
      acc.push(word);
      return acc;
    }, []);

    // If it's a short text, treat as one line
    const linesToAnimate = lines.length <= 1 ? [text] : lines;

    container.innerHTML = linesToAnimate
      .map((line) => `<span class="mask-reveal-line"><span class="inline-block" style="transform: translateY(100%)">${line}${linesToAnimate.length > 1 ? '' : ''}</span></span>`)
      .join(linesToAnimate.length > 1 ? '' : ' ');

    const innerSpans = Array.from(container.querySelectorAll(".mask-reveal-line > span")) as HTMLElement[];

    gsap.to(innerSpans, {
      y: "0%",
      duration: animDuration || 0.9,
      delay: animDelay,
      stagger: 0.08,
      ease: "power4.out",
    });
  }, [text]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Handle mask and scramble separately
    if (animation === "mask") {
      const animateIn = () => {
        if (hasAnimated.current && triggerOnScroll) return;
        hasAnimated.current = true;
        runMaskAnimation(container, delay, duration);
      };

      // Build initial DOM immediately (hidden state)
      const lines = text.includes("\n") ? text.split("\n") : [text];
      const linesToAnimate = lines.length <= 1 ? [text] : lines;
      container.innerHTML = linesToAnimate
        .map((line) => `<span class="mask-reveal-line"><span class="inline-block" style="transform: translateY(100%)">${line}</span></span>`)
        .join(linesToAnimate.length > 1 ? '' : ' ');

      if (triggerOnScroll) {
        const trigger = ScrollTrigger.create({
          trigger: container,
          start: "top 85%",
          onEnter: animateIn,
        });
        return () => { trigger.kill(); };
      } else {
        const timeout = setTimeout(animateIn, delay * 1000);
        return () => clearTimeout(timeout);
      }
    }

    if (animation === "scramble") {
      // Set initial state - show scrambled chars
      container.innerHTML = text
        .split("")
        .map((char) =>
          char === " "
            ? "<span class='inline-block'>&nbsp;</span>"
            : `<span class="inline-block" style="opacity: 0">${SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]}</span>`
        )
        .join("");

      const animateIn = () => {
        if (hasAnimated.current && triggerOnScroll) return;
        hasAnimated.current = true;
        runScrambleAnimation(container, delay);
      };

      if (triggerOnScroll) {
        const trigger = ScrollTrigger.create({
          trigger: container,
          start: "top 85%",
          onEnter: animateIn,
        });
        return () => { trigger.kill(); };
      } else {
        const timeout = setTimeout(animateIn, delay * 1000);
        return () => clearTimeout(timeout);
      }
    }

    // --- Original animation types: fade, slide, blur, rotate ---
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
  }, [text, type, animation, stagger, duration, delay, triggerOnScroll, runMaskAnimation, runScrambleAnimation]);

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
