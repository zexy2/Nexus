'use client';

import { useRef, useEffect, ReactNode, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VideoHeroProps {
  videoSrc?: string;
  posterSrc?: string;
  title: string | ReactNode;
  subtitle?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  overlayOpacity?: number;
  showScrollIndicator?: boolean;
  height?: 'full' | 'large' | 'medium';
}

export function VideoHero({
  videoSrc,
  posterSrc,
  title,
  subtitle,
  description,
  children,
  className,
  overlayOpacity = 0.6,
  showScrollIndicator = true,
  height = 'large',
}: VideoHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Parallax transforms
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1]);
  const textY = useTransform(scrollYProgress, [0, 0.5], ['0%', '50%']);

  const heightClass = {
    full: 'min-h-screen',
    large: 'min-h-[85vh]',
    medium: 'min-h-[60vh]',
  }[height];

  // Respect reduced motion
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (videoRef.current && prefersReducedMotion) {
      videoRef.current.pause();
    }
  }, []);

  return (
    <motion.section
      ref={containerRef}
      className={cn(
        'relative overflow-hidden flex items-center justify-center',
        heightClass,
        className
      )}
      style={{ opacity }}
    >
      {/* Video Background */}
      {videoSrc && (
        <motion.div
          className="absolute inset-0 z-0"
          style={{ y, scale }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            poster={posterSrc}
            onLoadedData={() => setIsVideoLoaded(true)}
            className={cn(
              'w-full h-full object-cover',
              'transition-opacity duration-1000',
              isVideoLoaded ? 'opacity-100' : 'opacity-0'
            )}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        </motion.div>
      )}

      {/* Static image fallback or poster */}
      {!videoSrc && posterSrc && (
        <motion.div
          className="absolute inset-0 z-0"
          style={{ y, scale }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterSrc}
            alt=""
            className="w-full h-full object-cover"
          />
        </motion.div>
      )}

      {/* Gradient overlays */}
      <div
        className="absolute inset-0 z-[1] bg-background"
        style={{ opacity: overlayOpacity }}
      />
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-background via-transparent to-background/50" />
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-background/80 via-transparent to-transparent h-32" />

      {/* Grain texture */}
      <div
        className="absolute inset-0 z-[2] opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center px-6 max-w-5xl mx-auto"
        style={{ y: textY }}
      >
        {/* Subtitle */}
        <AnimatePresence>
          {subtitle && (
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-label text-muted-foreground mb-4 block"
            >
              {subtitle}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {typeof title === 'string' ? (
            <h1 className="text-display font-bold tracking-tighter mb-6">
              {title}
            </h1>
          ) : (
            title
          )}
        </motion.div>

        {/* Description */}
        <AnimatePresence>
          {description && (
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-body-lg text-muted-foreground max-w-2xl mx-auto mb-8"
            >
              {description}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Additional content */}
        {children && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
          >
            {children}
          </motion.div>
        )}
      </motion.div>

      {/* Scroll indicator */}
      {showScrollIndicator && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-caption uppercase tracking-wider text-muted-foreground">
              Scroll
            </span>
            <div className="h-12 w-[1px] bg-gradient-to-b from-muted-foreground to-transparent" />
          </motion.div>
        </motion.div>
      )}

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-[3]" />
    </motion.section>
  );
}

export default VideoHero;
