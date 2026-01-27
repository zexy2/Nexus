"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { stockImages } from "@/lib/images";
import { HoverTilt } from "@/components/animations/magnetic-button";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function BentoGallery() {
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const items = gallery.querySelectorAll(".bento-item");

    gsap.set(items, { opacity: 0, y: 60, scale: 0.95 });

    ScrollTrigger.batch(items, {
      start: "top 85%",
      onEnter: (batch) => {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1,
          stagger: 0.1,
          ease: "power3.out",
        });
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section className="relative py-32 md:py-40 bg-black overflow-hidden">
      {/* Section header */}
      <div className="max-w-7xl mx-auto px-6 mb-16">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-500 mb-4 block">
          Showcase
        </span>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight max-w-3xl">
          Crafted with precision,
          <br />
          <span className="text-neutral-500">designed for impact.</span>
        </h2>
      </div>

      {/* Bento Grid */}
      <div
        ref={galleryRef}
        className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
      >
        {/* Large item */}
        <HoverTilt tiltAmount={5} className="bento-item col-span-2 row-span-2">
          <div className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[0].src}
              alt={stockImages.gallery[0].alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-6 left-6 right-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <span className="text-sm text-white/70">Featured</span>
              <h3 className="text-xl font-medium text-white mt-1">
                AI-Powered Workflows
              </h3>
            </div>
          </div>
        </HoverTilt>

        {/* Small items */}
        <HoverTilt tiltAmount={8} className="bento-item">
          <div className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[1].src}
              alt={stockImages.gallery[1].alt}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
          </div>
        </HoverTilt>

        <HoverTilt tiltAmount={8} className="bento-item">
          <div className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[2].src}
              alt={stockImages.gallery[2].alt}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
          </div>
        </HoverTilt>

        {/* Medium item */}
        <HoverTilt tiltAmount={6} className="bento-item col-span-2">
          <div className="relative aspect-video rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[3].src}
              alt={stockImages.gallery[3].alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6">
              <span className="text-sm text-white/70">Real-time</span>
              <h3 className="text-xl font-medium text-white mt-1">
                Collaborative Editing
              </h3>
            </div>
          </div>
        </HoverTilt>

        {/* Small items row */}
        <HoverTilt tiltAmount={8} className="bento-item">
          <div className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[4].src}
              alt={stockImages.gallery[4].alt}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
          </div>
        </HoverTilt>

        <HoverTilt tiltAmount={8} className="bento-item">
          <div className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer">
            <Image
              src={stockImages.gallery[5].src}
              alt={stockImages.gallery[5].alt}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
          </div>
        </HoverTilt>

        {/* Wide item */}
        <HoverTilt tiltAmount={5} className="bento-item col-span-2">
          <div className="relative aspect-[2/1] rounded-2xl overflow-hidden group cursor-pointer bg-neutral-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-white mb-2">∞</div>
                <span className="text-white/60">Infinite Possibilities</span>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>
        </HoverTilt>
      </div>
    </section>
  );
}
