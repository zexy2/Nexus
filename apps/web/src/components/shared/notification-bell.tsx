"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showToast } from "@/components/shared/toast-provider";
import { runTypeLabel } from "@/components/shared/run-controls";
import { useLocale, useT } from "@/lib/i18n/provider";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

/**
 * Workflow completion is observed by server-side reconciliation, which this
 * poll drives (see GET /api/notifications), so polling is the delivery path.
 */
const POLL_INTERVAL_MS = 20_000;
const MAX_TOASTS_PER_POLL = 3;
const KNOWN_TYPES = new Set([
  "workflow_completed",
  "workflow_failed",
  "workflow_cancelled",
  "plan_review_pending",
]);

export function notificationHref(item: Pick<NotificationItem, "type" | "data">): string {
  const changeSetId = typeof item.data?.changeSetId === "string" ? item.data.changeSetId : null;
  if (item.type === "plan_review_pending" && changeSetId) {
    return `/dashboard/changes?changeSet=${encodeURIComponent(changeSetId)}`;
  }
  return "/dashboard/agents";
}

export function NotificationBell() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  // Ids already shown (or present at first load), so only new arrivals toast.
  const seen = useRef<Set<string> | null>(null);

  const copyFor = useCallback(
    (item: Pick<NotificationItem, "type" | "data">) => {
      if (!KNOWN_TYPES.has(item.type)) {
        return { title: t("notifications.title"), description: "" };
      }
      const name = runTypeLabel(item.data?.workflowType, t);
      return {
        title: t(`notifications.type.${item.type}`).replace("{name}", name),
        description: t(`notifications.desc.${item.type}`),
      };
    },
    [t]
  );

  const markRead = useCallback(async (body: { ids: string[] } | { all: true }) => {
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { unreadCount: number };
      const readAt = new Date().toISOString();
      setUnreadCount(result.unreadCount);
      setItems((current) =>
        current.map((item) =>
          "all" in body || body.ids.includes(item.id) ? { ...item, readAt: item.readAt ?? readAt } : item
        )
      );
    } catch {
      // Next poll reconciles the badge.
    }
  }, []);

  const openItem = useCallback(
    (item: NotificationItem) => {
      if (!item.readAt) void markRead({ ids: [item.id] });
      router.push(notificationHref(item));
    },
    [markRead, router]
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as NotificationsResponse;
      setItems(body.notifications);
      setUnreadCount(body.unreadCount);

      if (seen.current === null) {
        seen.current = new Set(body.notifications.map((item) => item.id));
        return;
      }
      const fresh = body.notifications.filter((item) => !item.readAt && !seen.current!.has(item.id));
      for (const item of body.notifications) seen.current.add(item.id);
      for (const item of fresh.slice(0, MAX_TOASTS_PER_POLL)) {
        const copy = copyFor(item);
        const notify =
          item.type === "workflow_failed"
            ? showToast.error
            : item.type === "workflow_completed"
              ? showToast.success
              : showToast.info;
        notify(copy.title, {
          description: copy.description,
          action: { label: t("common.view"), onClick: () => openItem(item) },
        });
      }
    } catch {
      // Offline or server hiccup: keep the last known state.
    }
  }, [copyFor, openItem, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- false positive: every setState in load() runs after an await.
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);
  const label =
    unreadCount > 0
      ? `${t("notifications.open")}. ${t("notifications.unreadCount").replace("{n}", badge)}`
      : t("notifications.open");

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="notification-bell"
          aria-label={label}
          title={t("notifications.title")}
          className="relative p-2.5 rounded-full glass-premium hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="notification-badge"
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
            >
              {badge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-medium">{t("notifications.title")}</p>
          <button
            type="button"
            onClick={() => void markRead({ all: true })}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
            {t("notifications.markAllRead")}
          </button>
        </div>
        <DropdownMenuSeparator className="my-0" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("notifications.empty")}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {items.map((item) => {
              const copy = copyFor(item);
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => openItem(item)}
                  className="flex items-start gap-2 px-3 py-2"
                  data-testid="notification-item"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      item.readAt ? "bg-transparent" : "bg-cyan-500"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !item.readAt && "font-medium")}>{copy.title}</span>
                    {copy.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{copy.description}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-foreground-faint">
                      {formatRelativeDate(item.createdAt, locale)}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
