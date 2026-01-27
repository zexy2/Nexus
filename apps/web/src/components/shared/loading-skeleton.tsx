'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className, animate = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-muted/60',
        animate && 'animate-pulse',
        className
      )}
    />
  );
}

// Shimmer effect skeleton
export function SkeletonShimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/60',
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// Card skeleton
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'rounded-xl border bg-card p-6 space-y-4',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <SkeletonShimmer className="h-5 w-32" />
        <SkeletonShimmer className="h-8 w-8 rounded-full" />
      </div>
      <SkeletonShimmer className="h-8 w-24" />
      <SkeletonShimmer className="h-3 w-full" />
    </motion.div>
  );
}

// Document list skeleton
export function SkeletonDocumentList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-4 p-4 rounded-lg border bg-card"
        >
          <SkeletonShimmer className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonShimmer className="h-4 w-3/4" />
            <SkeletonShimmer className="h-3 w-1/2" />
          </div>
          <SkeletonShimmer className="h-8 w-20 rounded-md" />
        </motion.div>
      ))}
    </div>
  );
}

// Task card skeleton
export function SkeletonTaskCard() {
  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-start gap-3">
        <SkeletonShimmer className="h-5 w-5 rounded shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <SkeletonShimmer className="h-4 w-full" />
          <SkeletonShimmer className="h-3 w-2/3" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SkeletonShimmer className="h-5 w-16 rounded-full" />
        <SkeletonShimmer className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

// Kanban column skeleton
export function SkeletonKanbanColumn({ taskCount = 3 }: { taskCount?: number }) {
  return (
    <div className="w-80 shrink-0 bg-muted/30 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SkeletonShimmer className="h-5 w-24" />
        <SkeletonShimmer className="h-6 w-6 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: taskCount }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <SkeletonTaskCard />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Chat message skeleton
export function SkeletonChatMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <SkeletonShimmer className="h-8 w-8 rounded-full shrink-0" />
      <div className={cn('space-y-2 max-w-md', isUser && 'items-end')}>
        <SkeletonShimmer className="h-4 w-24" />
        <div className="space-y-1.5">
          <SkeletonShimmer className="h-3 w-80" />
          <SkeletonShimmer className="h-3 w-64" />
          <SkeletonShimmer className="h-3 w-48" />
        </div>
      </div>
    </div>
  );
}

// Stats card skeleton
export function SkeletonStatsCard() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <SkeletonShimmer className="h-4 w-24" />
        <SkeletonShimmer className="h-8 w-8 rounded-lg" />
      </div>
      <SkeletonShimmer className="h-8 w-16 mb-2" />
      <SkeletonShimmer className="h-3 w-32" />
    </div>
  );
}

// Dashboard skeleton (full page)
export function SkeletonDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonShimmer className="h-8 w-48" />
        <SkeletonShimmer className="h-4 w-96" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <SkeletonStatsCard />
          </motion.div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <SkeletonShimmer className="h-6 w-32" />
          <SkeletonDocumentList count={3} />
        </div>
        <div className="space-y-4">
          <SkeletonShimmer className="h-6 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <SkeletonTaskCard />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Agent activity skeleton
export function SkeletonAgentActivity() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
        >
          <SkeletonShimmer className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <SkeletonShimmer className="h-4 w-24" />
              <SkeletonShimmer className="h-3 w-16" />
            </div>
            <SkeletonShimmer className="h-3 w-full" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Settings page skeleton
export function SkeletonSettings() {
  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonShimmer key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="space-y-4"
        >
          <SkeletonShimmer className="h-6 w-40" />
          <div className="rounded-xl border bg-card p-6 space-y-6">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <SkeletonShimmer className="h-4 w-32" />
                  <SkeletonShimmer className="h-3 w-48" />
                </div>
                <SkeletonShimmer className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
