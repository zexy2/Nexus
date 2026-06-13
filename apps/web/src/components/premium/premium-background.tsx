'use client';

import { cn } from '@/lib/utils';

interface PremiumBackgroundProps {
  /** Kept for API compatibility — colour/blob options are no longer used. */
  colorScheme?: 'blue-violet' | 'violet-emerald' | 'amber-blue';
  blobCount?: 2 | 3 | 4;
  showGrid?: boolean;
  showNoise?: boolean;
  className?: string;
}

/**
 * Previously a field of animated, blurred colour blobs + noise + grid behind
 * the content — decorative motion that read as a template. Now it's just a
 * calm, static background that matches the theme. No motion, no noise.
 */
export function PremiumBackground({ className }: PremiumBackgroundProps) {
  return (
    <div
      className={cn('fixed inset-0 -z-10 bg-background pointer-events-none', className)}
    />
  );
}
