'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import CountUp from 'react-countup';
import { 
  ListTodo, 
  Circle, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  type LucideIcon 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/provider';

interface StatItem {
  icon: LucideIcon;
  value: number;
  label: string;
  color: string;
  bg: string;
  glowColor: string;
}

interface StatsOverviewProps {
  stats: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    aiTasks: number;
  };
}

function AnimatedStatCard({ 
  stat, 
  index 
}: { 
  stat: StatItem; 
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // SVG path animation on mount
  useEffect(() => {
    if (!iconRef.current) return;
    
    const icon = iconRef.current.querySelector('svg');
    if (!icon) return;

    const paths = icon.querySelectorAll('path, circle, polyline, line');
    
    paths.forEach((path) => {
      const length = (path as SVGGeometryElement).getTotalLength?.() || 100;
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });
      
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 1,
        delay: 0.3 + index * 0.1,
        ease: 'power2.out',
      });
    });
  }, [index]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        delay: 0.2 + index * 0.08,
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
        index === 4 && 'col-span-2 sm:col-span-1'
      )}
    >
      {/* Animated glow on hover */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        className={cn(
          'absolute inset-0 -z-10 blur-2xl transition-opacity duration-500',
          stat.glowColor
        )}
      />

      {/* Border gradient effect */}
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
            stat.bg,
            isHovered && 'bg-opacity-80'
          )}
        >
          <stat.icon className={cn('w-6 h-6', stat.color)} />
        </motion.div>

        {/* Value & Label */}
        <div>
          <div className="text-3xl font-bold tracking-tight text-white">
            <CountUp
              end={stat.value}
              duration={2}
              delay={0.3 + index * 0.1}
            />
          </div>
          <div className="text-sm text-white/40 font-medium">
            {stat.label}
          </div>
        </div>
      </div>

      {/* Subtle pulse for "In Progress" */}
      {index === 2 && stat.value > 0 && (
        <motion.div
          animate={{ 
            scale: [1, 1.5, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-3 right-3 w-2 h-2 rounded-full bg-white/60"
        />
      )}
    </motion.div>
  );
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const t = useT();
  // Monochrome icon tiles — colour is reserved for meaning (the kanban column
  // status dots / priority flags), not decorative stat icons.
  const neutral = {
    color: 'text-white/70',
    bg: 'bg-white/5',
    glowColor: 'bg-white/10',
  };
  const statItems: StatItem[] = [
    { icon: ListTodo, value: stats.total, label: t('tasks.statTotal'), ...neutral },
    { icon: Circle, value: stats.todo, label: t('tasks.statTodo'), ...neutral },
    { icon: Clock, value: stats.inProgress, label: t('tasks.statInProgress'), ...neutral },
    { icon: CheckCircle2, value: stats.done, label: t('tasks.statDone'), ...neutral },
    { icon: Sparkles, value: stats.aiTasks, label: t('tasks.statAi'), ...neutral },
  ];

  return (
    <section className="mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {statItems.map((stat, index) => (
          <AnimatedStatCard key={stat.label} stat={stat} index={index} />
        ))}
      </div>
    </section>
  );
}
