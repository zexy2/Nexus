'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BentoCardProps {
  title?: string;
  subtitle?: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2;
  gradient?: string;
  glowColor?: string;
  href?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function BentoCard({
  title,
  subtitle,
  description,
  icon,
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
  href,
  onClick,
  interactive = true,
}: BentoCardProps) {
  const colSpanClass = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2',
    3: 'col-span-1 md:col-span-2 lg:col-span-3',
  }[colSpan];

  const rowSpanClass = {
    1: 'row-span-1',
    2: 'row-span-1 md:row-span-2',
  }[rowSpan];

  const content = (
    <div
      className={cn(
        'relative rounded-2xl border border-white/10 bg-card',
        interactive && 'bento-card cursor-pointer',
        colSpanClass,
        rowSpanClass,
        className
      )}
    >
      <div className="relative h-full p-6 md:p-8 flex flex-col">
        {/* Header */}
        {(icon || title || subtitle) && (
          <div className="mb-4">
            {icon && (
              <div className="mb-4 h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                {icon}
              </div>
            )}
            {subtitle && (
              <span className="text-label text-muted-foreground mb-1 block">
                {subtitle}
              </span>
            )}
            {title && (
              <h3 className="text-title font-semibold tracking-tight">
                {title}
              </h3>
            )}
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="text-caption text-muted-foreground mb-4">
            {description}
          </p>
        )}

        {/* Children */}
        {children && <div className="flex-1">{children}</div>}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }

  return content;
}

interface BentoGridProps {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
}

export function BentoGrid({
  children,
  className,
  columns = 3,
  gap = 'md',
}: BentoGridProps) {
  const columnsClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  }[columns];

  const gapClass = {
    sm: 'gap-3 md:gap-4',
    md: 'gap-4 md:gap-6',
    lg: 'gap-6 md:gap-8',
  }[gap];

  return (
    <div className={cn('grid auto-rows-auto', columnsClass, gapClass, className)}>
      {children}
    </div>
  );
}

// Specialized Bento Cards

interface StatsBentoCardProps {
  title: string;
  value: string | number;
  suffix?: string;
  trend?: { value: number; label: string };
  icon: ReactNode;
  className?: string;
}

export function StatsBentoCard({
  title,
  value,
  suffix,
  trend,
  icon,
  className,
}: StatsBentoCardProps) {
  return (
    <BentoCard className={cn('min-h-[180px]', className)} interactive={false}>
      <div className="flex items-start justify-between mb-auto">
        <span className="text-caption text-muted-foreground">{title}</span>
        <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
          {icon}
        </div>
      </div>
      
      <div className="mt-auto">
        <div className="flex items-baseline gap-1">
          <motion.span
            className="text-4xl md:text-5xl font-bold tracking-tighter"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {value}
          </motion.span>
          {suffix && (
            <span className="text-xl text-muted-foreground">{suffix}</span>
          )}
        </div>
        
        {trend && (
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                'text-sm font-medium',
                trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'
              )}
            >
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </span>
            <span className="text-caption text-muted-foreground">
              {trend.label}
            </span>
          </div>
        )}
      </div>
    </BentoCard>
  );
}

interface ActivityBentoCardProps {
  title: string;
  items: {
    id: string;
    icon: ReactNode;
    title: string;
    description: string;
    time: string;
  }[];
  className?: string;
}

export function ActivityBentoCard({
  title,
  items,
  className,
}: ActivityBentoCardProps) {
  return (
    <BentoCard
      title={title}
      className={cn('min-h-[300px]', className)}
      colSpan={2}
      interactive={false}
    >
      <div className="space-y-4 mt-2">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-start gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.title}</p>
              <p className="text-caption text-muted-foreground truncate">
                {item.description}
              </p>
            </div>
            <span className="text-caption text-muted-foreground whitespace-nowrap">
              {item.time}
            </span>
          </motion.div>
        ))}
      </div>
    </BentoCard>
  );
}

interface QuickActionsBentoCardProps {
  title: string;
  actions: {
    id: string;
    icon: ReactNode;
    label: string;
    onClick: () => void;
  }[];
  className?: string;
}

export function QuickActionsBentoCard({
  title,
  actions,
  className,
}: QuickActionsBentoCardProps) {
  return (
    <BentoCard title={title} className={className} interactive={false}>
      <div className="grid grid-cols-2 gap-3 mt-2">
        {actions.map((action, index) => (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              {action.icon}
            </div>
            <span className="text-caption font-medium">{action.label}</span>
          </motion.button>
        ))}
      </div>
    </BentoCard>
  );
}

export default BentoGrid;
