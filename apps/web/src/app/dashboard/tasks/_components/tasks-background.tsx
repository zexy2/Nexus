'use client';

import { motion } from 'framer-motion';

export function TasksBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Base dark background */}
      <div className="absolute inset-0 bg-black" />
      
      {/* Animated mesh gradient blobs */}
      <div className="absolute inset-0">
        {/* Blue blob - top left */}
        <motion.div
          animate={{
            x: [0, 60, 0],
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-1/3 -left-1/4 w-2/3 h-2/3 rounded-full bg-blue-600/[0.03] blur-3xl"
        />
        
        {/* Amber blob - center right (task-themed) */}
        <motion.div
          animate={{
            x: [0, -50, 0],
            y: [0, 60, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 3,
          }}
          className="absolute top-1/3 -right-1/4 w-1/2 h-1/2 rounded-full bg-amber-500/[0.04] blur-3xl"
        />
        
        {/* Emerald blob - bottom (completion themed) */}
        <motion.div
          animate={{
            x: [0, 40, -40, 0],
            y: [0, -50, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 6,
          }}
          className="absolute -bottom-1/4 left-1/3 w-1/2 h-1/2 rounded-full bg-emerald-500/[0.03] blur-3xl"
        />

        {/* Violet accent blob - subtle */}
        <motion.div
          animate={{
            x: [0, 30, 0],
            y: [0, -30, 0],
            opacity: [0.03, 0.05, 0.03],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
          className="absolute top-1/2 left-1/4 w-1/3 h-1/3 rounded-full bg-violet-500/[0.04] blur-3xl"
        />
      </div>

      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
