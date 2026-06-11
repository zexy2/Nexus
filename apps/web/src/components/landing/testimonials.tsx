"use client";

import { useEffect, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import useEmblaCarousel from "embla-carousel-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface Testimonial {
  quote: string;
  title: string;
  role: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "Generate a document with Gemini, save it to the workspace, then turn that document into real Kanban tasks.",
    title: "Document to tasks",
    role: "Primary demo flow",
  },
  {
    quote:
      "Temporal workflow history shows running, completed, and failed AI work instead of hiding everything behind a spinner.",
    title: "Workflow visibility",
    role: "Operational signal",
  },
  {
    quote:
      "The public demo uses one server-managed Gemini key with strict daily quotas, audit logs, and a global AI kill switch.",
    title: "Budget guardrails",
    role: "Portfolio-safe AI",
  },
];

export function Testimonials() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "center" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };

    emblaApi.on("select", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();

  return (
    <section className="relative py-32 md:py-40 bg-neutral-50 overflow-hidden">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section header */}
        <ScrollReveal animation="fade-up" className="text-center mb-16">
          <span className="text-sm font-medium tracking-widest uppercase text-neutral-400 mb-4 block">
            Demo scope
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-black tracking-tight">
            What the live demo proves
          </h2>
        </ScrollReveal>

        {/* Carousel */}
        <div className="relative">
          <div ref={emblaRef} className="overflow-hidden">
            <div className="flex">
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="flex-none w-full md:w-[80%] lg:w-[60%] px-4"
                >
                  <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl shadow-black/5">
                    {/* Quote icon */}
                    <Quote className="size-10 text-neutral-200 mb-6" />

                    {/* Quote text */}
                    <blockquote className="text-xl md:text-2xl lg:text-3xl font-medium text-black leading-relaxed mb-8">
                      &ldquo;{testimonial.quote}&rdquo;
                    </blockquote>

                    <div>
                      <div className="font-semibold text-black">
                        {testimonial.title}
                      </div>
                      <div className="text-neutral-500">
                        {testimonial.role}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={scrollPrev}
              disabled={!canScrollPrev}
              className="size-12 rounded-full border border-neutral-200 bg-white flex items-center justify-center hover:border-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-5 text-neutral-600" />
            </button>

            {/* Dots */}
            <div className="flex items-center gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => emblaApi?.scrollTo(index)}
                  className={`size-2 rounded-full transition-all ${
                    index === selectedIndex
                      ? "w-8 bg-black"
                      : "bg-neutral-300 hover:bg-neutral-400"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={scrollNext}
              disabled={!canScrollNext}
              className="size-12 rounded-full border border-neutral-200 bg-white flex items-center justify-center hover:border-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="size-5 text-neutral-600" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
