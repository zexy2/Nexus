'use client';

import { Toaster, toast } from 'react-hot-toast';
import { CheckCircle, XCircle, AlertCircle, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Toast provider component
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2)',
          maxWidth: '400px',
        },
        success: {
          iconTheme: {
            primary: 'hsl(var(--primary))',
            secondary: 'white',
          },
        },
        error: {
          iconTheme: {
            primary: 'hsl(var(--destructive))',
            secondary: 'white',
          },
        },
      }}
    />
  );
}

// Custom toast functions with premium styling
interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const showToast = {
  success: (message: string, options?: ToastOptions) => {
    return toast.custom((t) => (
      <ToastContent
        t={t}
        type="success"
        message={message}
        description={options?.description}
        action={options?.action}
      />
    ), { duration: options?.duration });
  },

  error: (message: string, options?: ToastOptions) => {
    return toast.custom((t) => (
      <ToastContent
        t={t}
        type="error"
        message={message}
        description={options?.description}
        action={options?.action}
      />
    ), { duration: options?.duration || 5000 });
  },

  warning: (message: string, options?: ToastOptions) => {
    return toast.custom((t) => (
      <ToastContent
        t={t}
        type="warning"
        message={message}
        description={options?.description}
        action={options?.action}
      />
    ), { duration: options?.duration });
  },

  info: (message: string, options?: ToastOptions) => {
    return toast.custom((t) => (
      <ToastContent
        t={t}
        type="info"
        message={message}
        description={options?.description}
        action={options?.action}
      />
    ), { duration: options?.duration });
  },

  loading: (message: string) => {
    return toast.custom((t) => (
      <ToastContent
        t={t}
        type="loading"
        message={message}
      />
    ), { duration: Infinity });
  },

  dismiss: (toastId: string) => {
    toast.dismiss(toastId);
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) => {
    return toast.promise(promise, messages, {
      style: {
        background: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '12px',
        padding: '16px',
      },
    });
  },
};

// Custom toast content component
interface ToastContentProps {
  t: { id: string; visible: boolean };
  type: 'success' | 'error' | 'warning' | 'info' | 'loading';
  message: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

function ToastContent({ t, type, message, description, action }: ToastContentProps) {
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
    error: <XCircle className="h-5 w-5 text-destructive" />,
    warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    loading: <Loader2 className="h-5 w-5 text-primary animate-spin" />,
  };

  const borderColors = {
    success: 'border-l-emerald-500',
    error: 'border-l-destructive',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
    loading: 'border-l-primary',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl bg-card border border-border shadow-lg',
        'border-l-4',
        borderColors[type],
        t.visible ? 'animate-in slide-in-from-right-full' : 'animate-out slide-out-to-right-full',
        'transition-all duration-300'
      )}
      style={{ maxWidth: '400px' }}
    >
      <div className="shrink-0 mt-0.5">{icons[type]}</div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{message}</p>
        {description && (
          <p className="text-muted-foreground text-xs mt-1">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action && (
          <button
            onClick={() => {
              action.onClick();
              toast.dismiss(t.id);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
        {type !== 'loading' && (
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
