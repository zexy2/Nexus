'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AnimatedEdgeData {
  animated?: boolean;
  status?: 'idle' | 'active' | 'success' | 'error';
  label?: string;
}

const statusColors = {
  idle: {
    stroke: '#3f3f46', // zinc-700
    packet: '#71717a', // zinc-500
  },
  active: {
    stroke: '#7c3aed', // violet-600
    packet: '#a78bfa', // violet-400
  },
  success: {
    stroke: '#10b981', // emerald-500
    packet: '#34d399', // emerald-400
  },
  error: {
    stroke: '#ef4444', // red-500
    packet: '#f87171', // red-400
  },
};

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = (data || {}) as AnimatedEdgeData;
  const status = edgeData.status || 'idle';
  const colors = statusColors[status];
  const isAnimated = edgeData.animated !== false && status === 'active';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  return (
    <>
      {/* Base edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: colors.stroke,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: status === 'idle' ? '5,5' : 'none',
          transition: 'stroke 0.3s ease',
        }}
      />

      {/* Animated glow for active state */}
      {status === 'active' && (
        <path
          d={edgePath}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={6}
          strokeOpacity={0.3}
          className="animate-pulse"
        />
      )}

      {/* Animated packet/pulse */}
      {isAnimated && (
        <g>
          <defs>
            <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.packet} stopOpacity={0} />
              <stop offset="50%" stopColor={colors.packet} stopOpacity={1} />
              <stop offset="100%" stopColor={colors.packet} stopOpacity={0} />
            </linearGradient>
          </defs>
          
          {/* Traveling packet */}
          <circle r="4" fill={colors.packet} filter={`url(#glow-${id})`}>
            <animateMotion
              dur="1.5s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>

          {/* Secondary trailing packet */}
          <circle r="2.5" fill={colors.packet} opacity={0.5}>
            <animateMotion
              dur="1.5s"
              repeatCount="indefinite"
              path={edgePath}
              begin="0.3s"
            />
          </circle>
        </g>
      )}

      {/* Success checkmark animation */}
      {status === 'success' && (
        <g>
          <circle r="3" fill={colors.packet}>
            <animateMotion
              dur="0.8s"
              repeatCount="1"
              fill="freeze"
              path={edgePath}
            />
            <animate
              attributeName="opacity"
              values="1;0"
              dur="0.8s"
              fill="freeze"
            />
          </circle>
        </g>
      )}

      {/* Edge label */}
      {edgeData.label && (
        <EdgeLabelRenderer>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'absolute px-2 py-0.5 rounded text-[10px] font-medium',
              'bg-zinc-900/90 backdrop-blur-sm border border-zinc-700',
              status === 'active' ? 'text-violet-400' : 'text-zinc-400'
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {edgeData.label}
          </motion.div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
