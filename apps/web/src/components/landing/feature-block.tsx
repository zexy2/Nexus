"use client";

import { useRef, ReactNode } from "react";
import Image from "next/image";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ParallaxImage } from "@/components/animations/parallax-image";
import { stockImages } from "@/lib/images";

interface Feature {
  title: string;
  description: string;
  image: string;
  badge?: string;
}

const features: Feature[] = [
  {
    badge: "AI Agents",
    title: "Autonomous agents that understand your workflow",
    description:
      "Deploy intelligent AI agents that learn from your patterns, automate repetitive tasks, and collaborate seamlessly with your team. Each agent specializes in different domains—research, writing, coding, and more.",
    image: stockImages.features[0].src,
  },
  {
    badge: "Local-First",
    title: "Your data, always available",
    description:
      "Experience instant performance with our local-first architecture. Work offline without interruption, sync when you're ready. Your data stays on your device, giving you complete privacy and control.",
    image: stockImages.features[1].src,
  },
  {
    badge: "Real-Time",
    title: "Collaborate without boundaries",
    description:
      "Work together in real-time with live cursors, instant updates, and seamless presence awareness. Whether you're across the room or across the world, collaboration feels natural.",
    image: stockImages.features[2].src,
  },
  {
    badge: "Intelligence",
    title: "Insights that drive decisions",
    description:
      "Transform raw data into actionable intelligence. Our AI analyzes patterns, surfaces insights, and helps you make informed decisions faster than ever before.",
    image: stockImages.features[3].src,
  },
];

interface FeatureBlockProps {
  feature: Feature;
  index: number;
  reversed?: boolean;
}

function FeatureBlock({ feature, index, reversed = false }: FeatureBlockProps) {
  return (
    <div
      className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
        reversed ? "lg:grid-flow-col-dense" : ""
      }`}
    >
      {/* Content */}
      <ScrollReveal
        animation={reversed ? "fade-left" : "fade-right"}
        delay={0.1}
        className={reversed ? "lg:col-start-2" : ""}
      >
        <div className="max-w-lg">
          {feature.badge && (
            <span className="inline-block px-3 py-1 text-xs font-medium tracking-wider uppercase bg-black text-white rounded-full mb-6">
              {feature.badge}
            </span>
          )}
          <h3 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-black tracking-tight leading-[1.1] mb-6">
            {feature.title}
          </h3>
          <p className="text-lg text-neutral-600 leading-relaxed">
            {feature.description}
          </p>

          {/* Feature points */}
          <div className="mt-8 space-y-4">
            <FeaturePoint text="Enterprise-grade security" />
            <FeaturePoint text="Unlimited team members" />
            <FeaturePoint text="24/7 priority support" />
          </div>
        </div>
      </ScrollReveal>

      {/* Image */}
      <ScrollReveal
        animation={reversed ? "fade-right" : "fade-left"}
        delay={0.2}
        className={reversed ? "lg:col-start-1 lg:row-start-1" : ""}
      >
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/10">
          <ParallaxImage
            src={feature.image}
            alt={feature.title}
            className="absolute inset-0"
            speed={0.15}
            scale={1.1}
          />
          {/* Subtle overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/10" />
        </div>
      </ScrollReveal>
    </div>
  );
}

function FeaturePoint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-5 rounded-full bg-black flex items-center justify-center">
        <svg
          className="size-3 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="text-neutral-700">{text}</span>
    </div>
  );
}

export function FeatureBlocks() {
  return (
    <section className="relative py-32 md:py-40 bg-white overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-neutral-100 to-transparent rounded-full blur-3xl opacity-60" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section header */}
        <ScrollReveal animation="fade-up" className="text-center mb-24">
          <span className="text-sm font-medium tracking-widest uppercase text-neutral-400 mb-4 block">
            Features
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-black tracking-tight max-w-3xl mx-auto">
            Everything you need,
            <br />
            <span className="text-neutral-400">nothing you don&apos;t.</span>
          </h2>
        </ScrollReveal>

        {/* Feature blocks */}
        <div className="space-y-32 md:space-y-40">
          {features.map((feature, index) => (
            <FeatureBlock
              key={feature.title}
              feature={feature}
              index={index}
              reversed={index % 2 === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
