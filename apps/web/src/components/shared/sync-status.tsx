"use client";

/**
 * Sync Status Indicator
 * 
 * Shows the current synchronization status with the server.
 * Displays pending changes, online/offline state, and last sync time.
 */

import { useZeroStatus } from "@/lib/sync/zero";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Check, 
  AlertCircle,
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as React from "react";
import { useLocale } from "@/lib/i18n/provider";

interface SyncStatusProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncStatus({ className, showLabel = true }: SyncStatusProps) {
  const { status, isOnline, isSyncing, lastSyncedAt, pendingMutations } = useZeroStatus();
  const { t, locale } = useLocale();

  const getStatusIcon = () => {
    if (!isOnline) {
      return <CloudOff className="size-4 text-muted-foreground" />;
    }
    if (isSyncing) {
      return <Loader2 className="size-4 animate-spin text-blue-500" />;
    }
    if (pendingMutations > 0) {
      return <RefreshCw className="size-4 text-yellow-500" />;
    }
    if (status === "connected") {
      return <Check className="size-4 text-green-500" />;
    }
    if (status === "error") {
      return <AlertCircle className="size-4 text-red-500" />;
    }
    return <Cloud className="size-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (!isOnline) return t("syncStatus.offline");
    if (isSyncing) return t("syncStatus.syncing");
    if (pendingMutations > 0) return `${pendingMutations} ${t("syncStatus.pending")}`;
    if (status === "connected") return t("syncStatus.synced");
    if (status === "error") return t("syncStatus.error");
    return t("syncStatus.connecting");
  };

  const getStatusColor = () => {
    if (!isOnline) return "bg-gray-100 text-gray-600";
    if (isSyncing) return "bg-blue-100 text-blue-700";
    if (pendingMutations > 0) return "bg-yellow-100 text-yellow-700";
    if (status === "connected") return "bg-green-100 text-green-700";
    if (status === "error") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  };

  const formatLastSynced = React.useCallback(() => {
    if (!lastSyncedAt) return t("syncStatus.never");
    const diff = Date.now() - lastSyncedAt.getTime();
    if (diff < 60000) return t("syncStatus.justNow");
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t("syncStatus.minutesAgo")}`;
    return lastSyncedAt.toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US");
  }, [lastSyncedAt, locale, t]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "gap-1.5 cursor-default",
              getStatusColor(),
              className
            )}
          >
            {getStatusIcon()}
            {showLabel && <span className="text-xs">{getStatusText()}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("syncStatus.status")}:</span>
              <span className="font-medium">{getStatusText()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("syncStatus.network")}:</span>
              <span className="font-medium">{isOnline ? t("syncStatus.online") : t("syncStatus.offline")}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("syncStatus.lastSync")}:</span>
              <span className="font-medium">{formatLastSynced()}</span>
            </div>
            {pendingMutations > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("syncStatus.pendingLabel")}:</span>
                <span className="font-medium">{pendingMutations} {t("syncStatus.changes")}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Minimal sync indicator for tight spaces
 */
export function SyncDot({ className }: { className?: string }) {
  const { status, isOnline, isSyncing, pendingMutations } = useZeroStatus();
  const { t } = useLocale();

  const getColor = () => {
    if (!isOnline) return "bg-gray-400";
    if (isSyncing) return "bg-blue-500 animate-pulse";
    if (pendingMutations > 0) return "bg-yellow-500";
    if (status === "connected") return "bg-green-500";
    if (status === "error") return "bg-red-500";
    return "bg-gray-400";
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              getColor(),
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">
            {!isOnline ? t("syncStatus.offlineMode") :
             isSyncing ? t("syncStatus.syncing") :
             pendingMutations > 0 ? `${pendingMutations} ${t("syncStatus.pending")} ${t("syncStatus.changes")}` :
             status === "connected" ? t("syncStatus.allChangesSynced") :
             status === "error" ? t("syncStatus.error") : t("syncStatus.connecting")}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
