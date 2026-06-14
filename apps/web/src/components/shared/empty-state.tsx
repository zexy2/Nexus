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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
        className="mb-6"
      >
        {/* Clean, static icon tile — no glow, float or decorative dots. */}
        <div className="p-5 rounded-2xl bg-card border border-border text-muted-foreground">
          {icon || config.icon}
        </div>
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
