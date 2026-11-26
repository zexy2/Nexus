'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/provider';
import {
  AI_QUOTA_CHANGED_EVENT,
  effectiveRemaining,
  formatResetTime,
  type AiQuotaSnapshot,
} from '@/lib/ai/ai-errors';

/** Today's AI quota; refetches whenever notifyAiQuotaChanged() fires. */
export function useAiQuota() {
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/quota', { cache: 'no-store' });
      if (!res.ok) return;
      setQuota((await res.json()) as AiQuotaSnapshot);
    } catch {
      // Badge is informational; keep the last value.
    }
  }, []);

  useEffect(() => {
    // Initial fetch after mount; setState only runs once the request resolves.
    const timer = window.setTimeout(() => void refresh(), 0);
    const onChange = () => void refresh();
    window.addEventListener(AI_QUOTA_CHANGED_EVENT, onChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(AI_QUOTA_CHANGED_EVENT, onChange);
    };
  }, [refresh]);

  return { quota, refresh };
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/**
 * "12 of 200 messages left today" next to an AI action. Turns amber when the
 * quota is used up and says when it resets.
 */
export function AiQuotaBadge({
  kind,
  className,
}: {
  kind: 'chat' | 'workflow';
  className?: string;
}) {
  const { t, locale } = useLocale();
  const { quota } = useAiQuota();
  if (!quota) return null;

  const bucket = effectiveRemaining(quota, kind);
  const exhausted = bucket.remaining <= 0;
  const reset = bucket.resetAt ? formatResetTime(bucket.resetAt, locale) : null;
  const label = exhausted
    ? fill(t('aiQuota.exhausted'), { time: reset ?? t('aiQuota.soon') })
    : fill(t(kind === 'chat' ? 'aiQuota.chatLeft' : 'aiQuota.workflowLeft'), {
        remaining: bucket.remaining,
        limit: bucket.limit,
      });
  const title = [
    fill(t('aiQuota.callsLeft'), { remaining: quota.calls.remaining, limit: quota.calls.limit }),
    fill(t('aiQuota.chatLeft'), { remaining: quota.chat.remaining, limit: quota.chat.limit }),
    fill(t('aiQuota.workflowLeft'), { remaining: quota.workflow.remaining, limit: quota.workflow.limit }),
    reset ? fill(t('aiQuota.resetsAt'), { time: reset }) : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      data-testid={`ai-quota-${kind}`}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] tabular-nums',
        exhausted ? 'text-amber-700 dark:text-amber-300' : 'text-foreground-faint',
        className
      )}
    >
      <Gauge className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
