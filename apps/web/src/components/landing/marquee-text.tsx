"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface MarqueeItem {
  text: string;
  outlined?: boolean;
}

interface MarqueeTextProps {
  text: string;
  items?: MarqueeItem[];
  speed?: number;
  direction?: "left" | "right";
  className?: string;
  separator?: string;
  alternateOutline?: boolean;
}

export function MarqueeText({
  text,
  items,
  speed = 50,
  direction = "left",
  className = "",
  separator = "  •  ",
  alternateOutline = false,
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
  }, [direction, speed, text, items]);

  // Build content with outlined variant support
  const renderContent = () => {
    if (items && items.length > 0) {
      return items.map((item, idx) => (
        <span key={idx}>
          <span className={item.outlined || (alternateOutline && idx % 2 !== 0) ? 'text-stroke' : ''}>
            {item.text}
          </span>
          {idx < items.length - 1 && <span>{separator}</span>}
        </span>
      ));
    }

    // If alternateOutline is enabled, split text by separator and alternate
    if (alternateOutline) {
      const words = text.split(separator);
      return words.map((word, idx) => (
        <span key={idx}>
          <span className={idx % 2 !== 0 ? 'text-stroke' : ''}>{word}</span>
          {idx < words.length - 1 && <span>{separator}</span>}
        </span>
      ));
    }

    return <>{text}</>;
  };

  // Create repeated text for seamless loop
  const repeatedText = text ? `${text}${separator}${text}${separator}` : '';

  return (
    <div
      ref={marqueeRef}
      className={`overflow-hidden whitespace-nowrap ${className}`}
    >
      <div ref={contentRef} className="inline-block">
        {items || alternateOutline ? (
          <>
            <span>{renderContent()}{separator}{renderContent()}{separator}</span>
            <span>{renderContent()}{separator}{renderContent()}{separator}</span>
          </>
        ) : (
          <>
            <span>{repeatedText}</span>
            <span>{repeatedText}</span>
          </>
        )}
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
    <section className={`relative py-20 md:py-32 bg-[#0a0a0a] overflow-hidden ${className}`}>
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
  const words = [
    { text: "Prompt to document", accent: true },
    { text: "Document to tasks", accent: false },
    { text: "Tasks to Kanban", accent: false },
    { text: "Workflow history", accent: true },
    { text: "No visitor API key", accent: false },
  ];

  const marqueeContent = words
    .map((w) =>
      w.accent
        ? `<span class="text-white/40">${w.text}</span>`
        : w.text
    )
    .join("  \u2022  ");

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-card py-8">
      <div className="absolute bottom-0 left-0 top-0 z-10 w-20 bg-gradient-to-r from-card to-transparent" />
      <div className="absolute bottom-0 right-0 top-0 z-10 w-20 bg-gradient-to-l from-card to-transparent" />

      <div className="overflow-hidden whitespace-nowrap text-sm font-medium tracking-widest uppercase text-white/35">
        <div
          className="inline-block animate-marquee"
          dangerouslySetInnerHTML={{ __html: `${marqueeContent}  \u2022  ${marqueeContent}  \u2022  ${marqueeContent}  \u2022  ${marqueeContent}  \u2022  ` }}
        />
      </div>
    </section>
  );
}
