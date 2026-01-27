'use client';

import { useRef, useEffect, ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface StickySectionProps {
  title: string;
  subtitle?: string;
  description?: string;
  items: {
    id: string;
    title: string;
    description: string;
    image?: string;
    icon?: ReactNode;
    gradient?: string;
  }[];
  className?: string;
}

export function StickySection({
  title,
  subtitle,
  description,
  items,
  className,
}: StickySectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !leftRef.current || !rightRef.current) return;

    const ctx = gsap.context(() => {
      // Pin the left section while scrolling through items
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: () => `+=${rightRef.current!.scrollHeight - window.innerHeight}`,
        pin: leftRef.current,
        pinSpacing: false,
      });

      // Animate each item as it comes into view
      const itemElements = rightRef.current!.querySelectorAll('.sticky-item');
      itemElements.forEach((item, index) => {
        gsap.fromTo(
          item,
          {
            opacity: 0,
            y: 100,
            scale: 0.9,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: item,
              start: 'top 80%',
              end: 'top 30%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      });
    }, containerRef);

    return () => ctx.revert();
  }, [items]);

  return (
    <section
      ref={containerRef}
      className={cn('relative min-h-screen', className)}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Left sticky content */}
        <div
          ref={leftRef}
          className="lg:w-1/2 lg:h-screen flex items-center p-8 lg:p-16"
        >
          <div className="max-w-xl">
            {subtitle && (
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-label text-muted-foreground mb-4 block"
              >
                {subtitle}
              </motion.span>
            )}
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-hero font-bold tracking-tighter mb-6"
            >
              {title}
            </motion.h2>
            {description && (
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-body-lg text-muted-foreground"
              >
                {description}
              </motion.p>
            )}

            {/* Progress indicators */}
            <div className="hidden lg:flex items-center gap-2 mt-12">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="h-1 rounded-full bg-border overflow-hidden"
                  style={{ width: `${100 / items.length}%` }}
                >
                  <motion.div
                    className="h-full bg-foreground rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: '100%' }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.3, duration: 0.6 }}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right scrolling content */}
        <div
          ref={rightRef}
          className="lg:w-1/2 p-8 lg:p-16 space-y-8 lg:space-y-32"
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="sticky-item min-h-[60vh] lg:min-h-screen flex items-center"
            >
              <div
                className={cn(
                  'relative w-full rounded-3xl overflow-hidden',
                  'bg-card border border-border',
                  'backdrop-blur-xl',
                  item.gradient || 'bg-gradient-to-br from-card to-muted/50'
                )}
              >
                {/* Card content */}
                <div className="p-8 lg:p-12">
                  {/* Icon or number */}
                  <div className="flex items-center gap-4 mb-6">
                    {item.icon ? (
                      <div className="h-12 w-12 rounded-2xl bg-foreground/10 flex items-center justify-center">
                        {item.icon}
                      </div>
                    ) : (
                      <span className="text-6xl font-bold text-foreground/10">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  <h3 className="text-heading font-bold tracking-tight mb-4">
                    {item.title}
                  </h3>
                  <p className="text-body text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Image if provided */}
                {item.image && (
                  <div className="relative aspect-video">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                  </div>
                )}

                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-foreground/5 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-foreground/5 to-transparent rounded-full blur-2xl pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default StickySection;
