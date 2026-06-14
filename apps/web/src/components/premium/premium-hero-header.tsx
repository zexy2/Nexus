'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';

interface PremiumHeroHeaderProps {
  /**
   * Small label above the title (e.g., "DOCUMENT MANAGEMENT")
   */
  label: string;
  /**
   * Main title text
   */
  title: string;
  /**
   * Description or stats text below title
   */
  description?: React.ReactNode;
  /**
   * Action button or element on the right
   */
  action?: React.ReactNode;
  /**
   * Additional className
   */
  className?: string;
}

export function PremiumHeroHeader({
  label,
  title,
  description,
  action,
  className,
}: PremiumHeroHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!titleRef.current || !fillRef.current) return;

    // GSAP timeline for title fill animation
    const tl = gsap.timeline({ delay: 0.5 });

    tl.fromTo(
      fillRef.current,
      {
        clipPath: 'inset(0 100% 0 0)',
      },
      {
        clipPath: 'inset(0 0% 0 0)',
        duration: 1.2,
        ease: 'power3.out',
      }
    );

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <section className={cn('relative pt-8 pb-12', className)}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          {/* Label */}
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-xs uppercase tracking-[0.2em] text-white/40 mb-3 block"
          >
            {label}
          </motion.span>

          {/* Animated Title with outline-to-fill effect */}
          <motion.h1
            ref={titleRef}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-3"
          >
            {/* Outline text (always visible) */}
            <span
              className="text-transparent"
              style={{
                WebkitTextStroke: '1px rgba(255,255,255,0.3)',
              }}
            >
              {title}
            </span>

            {/* Fill text (animated with clip-path) */}
            <span
              ref={fillRef}
              className="absolute inset-0 text-white"
              style={{
                clipPath: 'inset(0 100% 0 0)',
              }}
            >
              {title}
            </span>
          </motion.h1>

          {/* Description */}
          {description && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-base md:text-lg text-white/50"
            >
              {description}
            </motion.div>
          )}
        </div>

        {/* Action Button */}
        {action && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          >
            {action}
          </motion.div>
        )}
      </div>
    </section>
  );
}
