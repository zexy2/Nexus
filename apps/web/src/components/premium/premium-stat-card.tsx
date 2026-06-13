'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import CountUp from 'react-countup';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface PremiumStatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  /**
   * Color theme for the card
   */
  color?: 'blue' | 'amber' | 'emerald' | 'violet' | 'neutral' | 'rose';
  /**
   * Delay for staggered animations (in seconds)
   */
  delay?: number;
  /**
   * Optional suffix for the value (e.g., '%', '+')
   */
  suffix?: string;
  /**
   * Optional prefix for the value (e.g., '$')
   */
  prefix?: string;
  /**
   * Whether to show decimal places
   */
  decimals?: number;
  /**
   * Duration of the count-up animation in seconds
   */
  countDuration?: number;
  /**
   * Optional trend indicator
   */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /**
   * Additional className
   */
  className?: string;
}

// Monochrome by design: the brand is B&W minimalism, so stat-card icon tiles are
// all neutral. The `color` prop is kept for API compatibility but every variant
// resolves to the same neutral treatment — colour is reserved for elements that
// carry meaning (status, priority), not decorative stat icons.
const NEUTRAL_STYLE = {
  text: 'text-white/70',
  bg: 'bg-white/5',
  glow: 'bg-white/10',
  border: 'border-white/10',
} as const;

const colorConfig = {
  blue: NEUTRAL_STYLE,
  amber: NEUTRAL_STYLE,
  emerald: NEUTRAL_STYLE,
  violet: NEUTRAL_STYLE,
  neutral: NEUTRAL_STYLE,
  rose: NEUTRAL_STYLE,
};

export function PremiumStatCard({
  icon: Icon,
  value,
  label,
  color = 'blue',
  delay = 0,
  suffix,
  prefix,
  decimals = 0,
  countDuration = 2,
  trend,
  className,
}: PremiumStatCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  const colors = colorConfig[color];

  // GSAP icon entrance animation
  useEffect(() => {
    if (!iconRef.current || hasAnimated) return;

    const icon = iconRef.current.querySelector('svg');
    if (!icon) return;

    const paths = icon.querySelectorAll('path, circle, polyline, line, rect');

    paths.forEach((path) => {
      const length = (path as SVGGeometryElement).getTotalLength?.() || 100;
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 0.8,
        delay: delay + 0.2,
        ease: 'power2.out',
        onComplete: () => setHasAnimated(true),
      });
    });
  }, [delay, hasAnimated]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay,
        type: 'spring',
        stiffness: 150,
        damping: 20,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative p-5 rounded-2xl overflow-hidden cursor-default',
        'bg-white/[0.03] backdrop-blur-xl',
        'border border-white/[0.08]',
        'transition-all duration-300',
        isHovered && 'border-white/20 bg-white/[0.05]',
        className
      )}
    >
      {/* Hover glow effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        className={cn(
          'absolute inset-0 -z-10 blur-2xl transition-opacity duration-500',
          colors.glow
        )}
      />

      {/* Border gradient on hover */}
      <div
        className={cn(
          'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500',
          'bg-gradient-to-br from-white/10 via-transparent to-transparent'
        )}
      />

      <div className="relative flex items-center gap-4">
        {/* Animated Icon */}
        <motion.div
          ref={iconRef}
          animate={{
            scale: isHovered ? 1.1 : 1,
            rotate: isHovered ? 5 : 0,
          }}
          transition={{ type: 'spring', stiffness: 300 }}
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            'transition-colors duration-300',
            colors.bg,
            isHovered && 'bg-opacity-80'
          )}
        >
          <Icon className={cn('w-6 h-6', colors.text)} />
        </motion.div>

        {/* Value & Label */}
        <div className="flex-1">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-white">
              {prefix}
              <CountUp
                end={value}
                duration={countDuration}
                delay={delay}
                decimals={decimals}
                separator=","
              />
              {suffix}
            </span>
            
            {/* Trend indicator */}
            {trend && (
              <span
                className={cn(
                  'text-xs font-medium ml-2',
                  trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          <div className="text-sm text-white/40 font-medium">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}
