'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TasksHeroHeaderProps {
  stats: {
    total: number;
    inProgress: number;
    aiTasks: number;
  };
  onCreateTask: () => void;
}

export function TasksHeroHeader({ stats, onCreateTask }: TasksHeroHeaderProps) {
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
    <section className="relative pt-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          {/* Label */}
          <motion.span
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6 }}
            className="text-xs md:text-sm font-medium tracking-[0.2em] text-white/40 mb-4 block uppercase"
          >
            Task Management
          </motion.span>

          {/* Animated Title with Outline + Fill Effect */}
          <div className="relative mb-4">
            <motion.h1
              ref={titleRef}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter"
            >
              {/* Outline layer (always visible) */}
              <span 
                className="relative text-transparent"
                style={{
                  WebkitTextStroke: '1px rgba(255,255,255,0.2)',
                }}
              >
                Görevler
              </span>
              
              {/* Fill layer (animated clip-path) */}
              <span
                ref={fillRef}
                className="absolute inset-0 text-white"
                style={{
                  clipPath: 'inset(0 100% 0 0)',
                }}
              >
                Görevler
              </span>
            </motion.h1>

            {/* Glow effect behind title */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
              className="absolute -inset-x-10 -inset-y-4 bg-gradient-to-r from-white/10 via-transparent to-white/5 blur-3xl -z-10"
            />
          </div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-base md:text-lg text-white/50"
          >
            <span className="text-white/70 font-medium">{stats.total}</span> görev 
            <span className="mx-2 text-white/20">•</span>
            <span className="text-white/70">{stats.inProgress}</span> devam ediyor
            <span className="mx-2 text-white/20">•</span>
            <span className="text-white/70">{stats.aiTasks}</span> AI atandı
          </motion.p>
        </div>

        {/* Create Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
        >
          <Button
            onClick={onCreateTask}
            className="gap-2 rounded-full px-6 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
          >
            <Plus className="w-4 h-4" />
            Yeni Görev
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
