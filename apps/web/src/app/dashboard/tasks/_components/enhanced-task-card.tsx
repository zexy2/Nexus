'use client';

import { forwardRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  GripVertical, 
  MessageSquare, 
  Sparkles, 
  Calendar,
  Zap 
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Task interface defined locally
interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'done';
  source?: 'user' | 'ai';
  comments?: number;
  dueDate?: string;
  assignee?: {
    name: string;
    avatar?: string;
  };
  subtasks?: {
    completed: number;
    total: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface EnhancedTaskCardProps {
  task: Task;
  isDragging?: boolean;
  onClick?: () => void;
  listeners?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

const priorityConfig = {
  low: {
    label: 'Düşük',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: 'shadow-emerald-500/10',
  },
  medium: {
    label: 'Orta',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    glow: 'shadow-amber-500/10',
  },
  high: {
    label: 'Yüksek',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    glow: 'shadow-rose-500/10',
  },
};

export const EnhancedTaskCard = forwardRef<HTMLDivElement, EnhancedTaskCardProps>(
  ({ task, isDragging = false, onClick, listeners, attributes }, ref) => {
    const [isHovered, setIsHovered] = useState(false);
    
    // 3D Hover Tilt Effect
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    
    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), {
      stiffness: 150,
      damping: 20,
    });
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), {
      stiffness: 150,
      damping: 20,
    });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX.set(x);
      mouseY.set(y);
    };

    const handleMouseLeave = () => {
      mouseX.set(0);
      mouseY.set(0);
      setIsHovered(false);
    };

    const priority = priorityConfig[task.priority];
    const isAITask = task.source === 'ai';
    const isUrgent = task.priority === 'high';

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ 
          opacity: 1, 
          scale: isDragging ? 1.02 : 1, 
          y: 0,
        }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        whileTap={{ scale: 0.98 }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        style={{ 
          transformStyle: 'preserve-3d',
          perspective: 1000,
          rotateX: isDragging ? 0 : rotateX,
          rotateY: isDragging ? 0 : rotateY,
        }}
        className={cn(
          'group relative rounded-xl overflow-hidden cursor-pointer',
          'bg-white/[0.02] backdrop-blur-md',
          'border border-white/[0.06]',
          'transition-all duration-200',
          isDragging && 'shadow-2xl shadow-black/30 border-white/20 z-50',
          isHovered && !isDragging && 'border-white/15 bg-white/[0.04]',
        )}
      >
        {/* Animated border gradient */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          className={cn(
            'absolute inset-0 -z-10 rounded-xl',
            'bg-gradient-to-br from-white/10 via-transparent to-transparent',
          )}
        />

        {/* Glow effect */}
        {(isHovered || isDragging) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            className={cn(
              'absolute inset-0 -z-20 blur-xl',
              isAITask ? 'bg-violet-500/10' : 'bg-primary/10',
            )}
          />
        )}

        {/* Card content */}
        <div className="relative p-4">
          {/* Drag handle + Priority Badge row */}
          <div className="flex items-center justify-between mb-3">
            <div 
              {...listeners} 
              {...attributes}
              className={cn(
                'p-1.5 -ml-1.5 rounded-lg cursor-grab active:cursor-grabbing',
                'opacity-40 group-hover:opacity-100 transition-opacity',
                'hover:bg-white/5',
              )}
            >
              <GripVertical className="w-4 h-4 text-white/60" />
            </div>

            <div className="flex items-center gap-2">
              {/* AI Badge */}
              {isAITask && (
                <motion.span
                  animate={{ 
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    'bg-violet-500/15 text-violet-400 border border-violet-500/20',
                    'flex items-center gap-1',
                  )}
                >
                  <Sparkles className="w-3 h-3" />
                  AI
                </motion.span>
              )}

              {/* Priority badge */}
              <span 
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  priority.bg, priority.color, 'border', priority.border,
                )}
              >
                {priority.label}
              </span>
            </div>
          </div>

          {/* Title */}
          <h3 className={cn(
            'text-sm font-semibold text-white/90 mb-2 line-clamp-2',
            'group-hover:text-white transition-colors',
          )}>
            {task.title}
          </h3>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-white/40 line-clamp-2 mb-3">
              {task.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-white/30">
            <div className="flex items-center gap-3">
              {/* Comments count */}
              {task.comments && task.comments > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {task.comments}
                </span>
              )}

              {/* Due date */}
              {task.dueDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(task.dueDate).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </div>

            {/* Urgent indicator */}
            {isUrgent && (
              <motion.span
                animate={{ 
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity,
                }}
                className="flex items-center gap-1 text-rose-400"
              >
                <Zap className="w-3.5 h-3.5" />
              </motion.span>
            )}
          </div>
        </div>

        {/* Progress bar for sub-tasks (if exists) */}
        {task.subtasks && task.subtasks.total > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
              <span>Alt görevler</span>
              <span>{task.subtasks.completed}/{task.subtasks.total}</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ 
                  width: `${(task.subtasks.completed / task.subtasks.total) * 100}%` 
                }}
                transition={{ 
                  duration: 0.8, 
                  delay: 0.2,
                  ease: 'easeOut',
                }}
                className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full"
              />
            </div>
          </div>
        )}
      </motion.div>
    );
  }
);

EnhancedTaskCard.displayName = 'EnhancedTaskCard';
