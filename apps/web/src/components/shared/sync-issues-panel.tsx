"use client";

/**
 * Sync issues: the mutations kept in the sync engine's rejected store, either
 * refused by the server (4xx) or parked after repeated server errors. Each can
 * be retried (re-queued at the end of the push queue) or discarded for good.
 * Opened from the sync status indicator in the dashboard shell.
 */
import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { showToast } from "@/components/shared/toast-provider";
import { useLocale } from "@/lib/i18n/provider";
import { useZero, type RejectedMutation } from "@/lib/sync/zero";

const TABLE_LABEL_KEYS: Record<string, string> = {
  docs: "syncStatus.tableDocs",
  tasks: "syncStatus.tableTasks",
  workspaces: "syncStatus.tableWorkspaces",
  chat_messages: "syncStatus.tableChatMessages",
};

const OPERATION_LABEL_KEYS: Record<RejectedMutation["operation"], string> = {
  insert: "syncStatus.operationInsert",
  update: "syncStatus.operationUpdate",
  delete: "syncStatus.operationDelete",
};

function recordLabel(mutation: RejectedMutation): string | null {
  const data = mutation.data ?? {};
  for (const key of ["title", "name", "content"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      return text.length > 60 ? `${text.slice(0, 57)}...` : text;
    }
  }
  return null;
}

export function SyncIssuesPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { engine, rejectedMutations } = useZero();
  const { t, locale } = useLocale();
  const [items, setItems] = useState<RejectedMutation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(
    (): Promise<RejectedMutation[]> =>
      engine && !engine.isDestroyed
        ? engine.getRejectedMutations().catch(() => [])
        : Promise.resolve([]),
    [engine]
  );
  const reload = useCallback(async () => setItems(await load()), [load]);

  // Reload when opened and whenever the rejected store changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, load, rejectedMutations]);

  const handleRetry = async (id: string) => {
    if (!engine) return;
    setBusyId(id);
    try {
      await engine.retryRejectedMutation(id);
    } catch {
      showToast.error(t("syncStatus.retryFailed"));
    } finally {
      setBusyId(null);
      await reload();
    }
  };

  const handleDiscard = async (id: string) => {
    if (!engine) return;
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setBusyId(id);
    try {
      await engine.dismissRejectedMutation(id);
    } finally {
      setBusyId(null);
      setConfirmingId(null);
      await reload();
    }
  };

  const formatTime = (ms: number) => {
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
    } catch {
      return new Date(ms).toISOString();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("syncStatus.issuesTitle")}</SheetTitle>
          <SheetDescription>{t("syncStatus.issuesDescription")}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("syncStatus.issuesEmpty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{t("syncStatus.issuesTableCaption")}</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th scope="col" className="py-2 pr-2 font-medium">{t("syncStatus.columnTable")}</th>
                  <th scope="col" className="py-2 pr-2 font-medium">{t("syncStatus.columnOperation")}</th>
                  <th scope="col" className="py-2 pr-2 font-medium">{t("syncStatus.columnReason")}</th>
                  <th scope="col" className="py-2 pr-2 font-medium">{t("syncStatus.columnTime")}</th>
                  <th scope="col" className="py-2 font-medium text-right">{t("syncStatus.columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const label = recordLabel(item);
                  const serverError = item.reason === "server_error";
                  const busy = busyId === item.id;
                  return (
                    <tr key={item.id} className="border-b align-top" data-testid="sync-issue-row">
                      <td className="py-2 pr-2">
                        <div>{TABLE_LABEL_KEYS[item.table] ? t(TABLE_LABEL_KEYS[item.table]) : item.table}</div>
                        {label && <div className="text-xs text-muted-foreground break-all">{label}</div>}
                      </td>
                      <td className="py-2 pr-2">{t(OPERATION_LABEL_KEYS[item.operation] ?? item.operation)}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={serverError ? "secondary" : "destructive"}>
                          {serverError ? t("syncStatus.reasonServerError") : t("syncStatus.reasonRejected")}
                        </Badge>
                        {(item.error || item.code) && (
                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            {item.error}
                            {item.code ? ` (${item.code})` : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <time dateTime={new Date(item.rejectedAt).toISOString()}>{formatTime(item.rejectedAt)}</time>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !engine}
                            onClick={() => void handleRetry(item.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("syncStatus.retry")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={confirmingId === item.id ? "destructive" : "ghost"}
                            disabled={busy || !engine}
                            onClick={() => void handleDiscard(item.id)}
                            onBlur={() => setConfirmingId((current) => (current === item.id ? null : current))}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {confirmingId === item.id ? t("syncStatus.confirmDiscard") : t("syncStatus.discard")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
