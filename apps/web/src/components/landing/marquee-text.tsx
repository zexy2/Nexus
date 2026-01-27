"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface MarqueeTextProps {
  text: string;
  speed?: number;
  direction?: "left" | "right";
  className?: string;
  separator?: string;
}

export function MarqueeText({
  text,
  speed = 50,
  direction = "left",
  className = "",
  separator = "  •  ",
}: MarqueeTextProps) {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;
    const content = contentRef.current;
    if (!marquee || !content) return;

    // Calculate duration based on content width and speed
    const contentWidth = content.offsetWidth;
    const duration = contentWidth / speed;

    // Set initial position for right direction
    if (direction === "right") {
      gsap.set(content, { x: -contentWidth / 2 });
    }

    // Create infinite loop animation
    const tl = gsap.to(content, {
      x: direction === "left" ? -contentWidth / 2 : 0,
      duration,
      ease: "none",
      repeat: -1,
    });

    return () => {
      tl.kill();
    };
  }, [direction, speed, text]);

  // Create repeated text for seamless loop
  const repeatedText = `${text}${separator}${text}${separator}`;

  return (
    <div
      ref={marqueeRef}
      className={`overflow-hidden whitespace-nowrap ${className}`}
    >
      <div ref={contentRef} className="inline-block">
        <span>{repeatedText}</span>
        <span>{repeatedText}</span>
      </div>
    </div>
  );
}

// Multi-line marquee with alternating directions
interface MarqueeBannerProps {
  lines: string[];
  className?: string;
}

export function MarqueeBanner({ lines, className = "" }: MarqueeBannerProps) {
  return (
    <section className={`relative py-20 md:py-32 bg-black overflow-hidden ${className}`}>
      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-10" />

      <div className="space-y-6">
        {lines.map((line, index) => (
          <MarqueeText
            key={index}
            text={line}
            direction={index % 2 === 0 ? "left" : "right"}
            speed={30 + index * 10}
            className="text-6xl md:text-8xl lg:text-9xl font-bold text-white/5 hover:text-white/10 transition-colors duration-500"
            separator="   "
          />
        ))}
      </div>
    </section>
  );
}

// Simple single marquee for headers/CTAs
export function SimpleMarquee() {
  return (
    <section className="relative py-8 bg-white border-y border-neutral-200 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10" />

      <MarqueeText
        text="AI-Powered  •  Local-First  •  Real-Time Collaboration  •  Enterprise Ready  •  Secure by Default"
        speed={40}
        className="text-sm font-medium tracking-widest uppercase text-neutral-400"
        separator="     "
      />
    </section>
  );
}
