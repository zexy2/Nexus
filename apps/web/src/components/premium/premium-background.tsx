'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PremiumBackgroundProps {
  /**
   * Color scheme for the animated blobs
   * - 'blue-violet': Blue and violet tones (default, good for docs/content)
   * - 'violet-emerald': Violet and emerald tones (good for AI/agents)
   * - 'amber-blue': Amber and blue tones (good for tasks/productivity)
   */
  colorScheme?: 'blue-violet' | 'violet-emerald' | 'amber-blue';
  /**
   * Number of animated blobs (2-4, default 3)
   */
  blobCount?: 2 | 3 | 4;
  /**
   * Whether to show the grid overlay
   */
  showGrid?: boolean;
  /**
   * Whether to show the noise texture
   */
  showNoise?: boolean;
  /**
   * Additional className for the container
   */
  className?: string;
}

const colorSchemes = {
  'blue-violet': [
    'bg-blue-500/20',
    'bg-violet-500/15',
    'bg-indigo-500/20',
    'bg-purple-500/15',
  ],
  'violet-emerald': [
    'bg-violet-500/20',
    'bg-emerald-500/15',
    'bg-teal-500/20',
    'bg-purple-500/15',
  ],
  'amber-blue': [
    'bg-blue-500/15',
    'bg-amber-500/20',
    'bg-emerald-500/15',
    'bg-violet-500/20',
  ],
};

const blobPositions = [
  { top: '10%', left: '20%' },
  { top: '60%', right: '10%' },
  { bottom: '20%', left: '30%' },
  { top: '30%', right: '25%' },
];

export function PremiumBackground({
  colorScheme = 'blue-violet',
  blobCount = 3,
  showGrid = true,
  showNoise = true,
  className,
}: PremiumBackgroundProps) {
  const colors = colorSchemes[colorScheme];
  const blobs = colors.slice(0, blobCount);

  return (
    <div
      className={cn(
        'fixed inset-0 -z-10 overflow-hidden pointer-events-none',
        className
      )}
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-neutral-950 to-black" />

      {/* Animated blobs */}
      {blobs.map((color, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.4, 0.6, 0.4],
            scale: [1, 1.2, 1],
            x: [0, 30 * (index % 2 === 0 ? 1 : -1), 0],
            y: [0, 20 * (index % 2 === 0 ? -1 : 1), 0],
          }}
          transition={{
            duration: 20 + index * 5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 2,
          }}
          style={{
            ...blobPositions[index],
            willChange: 'transform, opacity',
          }}
          className={cn(
            'absolute w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full blur-3xl',
            color
          )}
        />
      ))}

      {/* Grid overlay */}
      {showGrid && (
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      )}

      {/* Noise texture */}
      {showNoise && (
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      )}

      {/* Vignette effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
    </div>
  );
}
