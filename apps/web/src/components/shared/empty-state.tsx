'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  FileText, 
  MessageSquare, 
  CheckSquare, 
  Inbox, 
  Search,
  FolderOpen,
  Plus,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type EmptyStateType = 
  | 'documents'
  | 'tasks'
  | 'chat'
  | 'search'
  | 'folder'
  | 'inbox'
  | 'custom';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const defaultConfig: Record<EmptyStateType, { icon: React.ReactNode; title: string; description: string }> = {
  documents: {
    icon: <FileText className="h-12 w-12" />,
    title: 'No documents yet',
    description: 'Create your first document to start writing and collaborating with AI.',
  },
  tasks: {
    icon: <CheckSquare className="h-12 w-12" />,
    title: 'No tasks yet',
    description: 'Add your first task to start organizing your work.',
  },
  chat: {
    icon: <MessageSquare className="h-12 w-12" />,
    title: 'Start a conversation',
    description: 'Send a message to begin chatting with your AI agents.',
  },
  search: {
    icon: <Search className="h-12 w-12" />,
    title: 'No results found',
    description: 'Try adjusting your search terms or filters.',
  },
  folder: {
    icon: <FolderOpen className="h-12 w-12" />,
    title: 'This folder is empty',
    description: 'Add documents or create subfolders to organize your content.',
  },
  inbox: {
    icon: <Inbox className="h-12 w-12" />,
    title: 'You\'re all caught up',
    description: 'No new notifications or items to review.',
  },
  custom: {
    icon: <Sparkles className="h-12 w-12" />,
    title: 'Nothing here yet',
    description: 'Get started by creating something new.',
  },
};

export function EmptyState({
  type = 'custom',
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const config = defaultConfig[type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        className
      )}
    >
      {/* Animated Icon Container */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.1 
        }}
        className="relative mb-6"
      >
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl scale-150" />
        
        {/* Icon container */}
        <div className="relative p-6 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50">
          <motion.div
            animate={{ 
              y: [0, -4, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="text-muted-foreground/60"
          >
            {icon || config.icon}
          </motion.div>
        </div>

        {/* Decorative dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute -top-2 -right-2 h-3 w-3 rounded-full bg-primary/20"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="absolute -bottom-1 -left-3 h-2 w-2 rounded-full bg-primary/15"
        />
      </motion.div>

      {/* Text content */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-lg font-semibold mb-2"
      >
        {title || config.title}
      </motion.h3>
      
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-sm max-w-sm mb-6"
      >
        {description || config.description}
      </motion.p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-3"
        >
          {action && (
            <Button 
              onClick={action.onClick}
              className="gap-2 group"
            >
              {action.icon || <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform duration-200" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button 
              variant="ghost" 
              onClick={secondaryAction.onClick}
              className="text-muted-foreground hover:text-foreground"
            >
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
