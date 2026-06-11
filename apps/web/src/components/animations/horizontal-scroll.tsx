'use client';

import { useRef, useEffect, ReactNode } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface HorizontalScrollItem {
  id: string;
  title: string;
  description?: string;
  image?: string;
  icon?: ReactNode;
  gradient?: string;
  href?: string;
}

interface HorizontalScrollProps {
  items: HorizontalScrollItem[];
  title?: string;
  subtitle?: string;
  className?: string;
  cardClassName?: string;
}

export function HorizontalScroll({
  items,
  title,
  subtitle,
  className,
  cardClassName,
}: HorizontalScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !scrollerRef.current) return;

    const ctx = gsap.context(() => {
      const scroller = scrollerRef.current!;
      const scrollWidth = scroller.scrollWidth - scroller.clientWidth;

      gsap.to(scroller, {
        x: -scrollWidth,
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: () => `+=${scrollWidth}`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // Parallax effect for each card
      const cards = scroller.querySelectorAll('.h-scroll-card');
      cards.forEach((card, index) => {
        const inner = card.querySelector('.h-scroll-card-inner');
        if (inner) {
          gsap.to(inner, {
            y: index % 2 === 0 ? -30 : 30,
            scrollTrigger: {
              trigger: containerRef.current,
              start: 'top top',
              end: () => `+=${scrollWidth}`,
              scrub: 1,
            },
          });
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, [items]);

  return (
    <section
      ref={containerRef}
      className={cn('relative min-h-screen overflow-hidden', className)}
    >
      {/* Header */}
      {(title || subtitle) && (
        <div className="absolute top-0 left-0 right-0 z-10 p-8 lg:p-16 pointer-events-none">
          {subtitle && (
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-label text-muted-foreground mb-2 block"
            >
              {subtitle}
            </motion.span>
          )}
          {title && (
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-heading font-bold tracking-tighter"
            >
              {title}
            </motion.h2>
          )}
        </div>
      )}

      {/* Horizontal scroller */}
      <div
        ref={scrollerRef}
        className="flex items-center h-screen gap-8 px-8 lg:px-16 pt-32"
        style={{ width: `${items.length * 450 + 200}px` }}
      >
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            className={cn(
              'h-scroll-card relative flex-shrink-0 w-[350px] lg:w-[400px]',
              cardClassName
            )}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ delay: index * 0.1 }}
          >
            <div
              className={cn(
                'h-scroll-card-inner relative h-[500px] lg:h-[600px] rounded-3xl overflow-hidden',
                'bg-card border border-border/50',
                'backdrop-blur-xl',
                'group cursor-pointer',
                'transition-all duration-500',
                'hover:border-foreground/20 hover:scale-[1.02]'
              )}
              data-cursor="pointer"
              data-cursor-text="View"
            >
              {/* Background gradient */}
              <div
                className={cn(
                  'absolute inset-0 opacity-50 group-hover:opacity-70 transition-opacity',
                  item.gradient || 'bg-gradient-to-br from-foreground/5 to-transparent'
                )}
              />

              {/* Image */}
              {item.image && (
                <div className="absolute inset-0">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                </div>
              )}

              {/* Content */}
              <div className="relative h-full flex flex-col justify-end p-8">
                {/* Icon */}
                {item.icon && (
                  <div className="mb-auto pt-4">
                    <div className="h-14 w-14 rounded-2xl bg-foreground/10 backdrop-blur-sm flex items-center justify-center group-hover:bg-foreground/20 transition-colors">
                      {item.icon}
                    </div>
                  </div>
                )}

                {/* Number */}
                <span className="text-8xl font-bold text-foreground/10 absolute top-8 right-8">
                  {String(index + 1).padStart(2, '0')}
                </span>

                {/* Title & Description */}
                <div className="mt-auto">
                  <h3 className="text-title font-bold tracking-tight mb-3 group-hover:text-foreground transition-colors">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-caption text-muted-foreground line-clamp-3">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Hover indicator */}
                <motion.div
                  className="absolute bottom-8 right-8 h-12 w-12 rounded-full border border-foreground/20 flex items-center justify-center"
                  whileHover={{ scale: 1.1 }}
                >
                  <motion.svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    initial={{ x: 0, opacity: 0.5 }}
                    whileHover={{ x: 3, opacity: 1 }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </motion.svg>
                </motion.div>
              </div>

              {/* Shine effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              </div>
            </div>
          </motion.div>
        ))}

        {/* End spacer */}
        <div className="flex-shrink-0 w-[100px]" />
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 text-muted-foreground">
        <motion.div
          animate={{ x: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </motion.div>
        <span className="text-caption uppercase tracking-wider">Scroll to explore</span>
      </div>
    </section>
  );
}

export default HorizontalScroll;
