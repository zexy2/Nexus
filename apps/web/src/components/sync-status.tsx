"use client";

/**
 * Sync Status Indicator
 * 
 * Shows the current synchronization status with the server.
 * Displays pending changes, online/offline state, and last sync time.
 */

import { useZeroStatus } from "@/lib/zero";
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

interface SyncStatusProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncStatus({ className, showLabel = true }: SyncStatusProps) {
  const { status, isOnline, isSyncing, lastSyncedAt, pendingMutations } = useZeroStatus();

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
    if (!isOnline) return "Offline";
    if (isSyncing) return "Syncing...";
    if (pendingMutations > 0) return `${pendingMutations} pending`;
    if (status === "connected") return "Synced";
    if (status === "error") return "Sync error";
    return "Connecting...";
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
    if (!lastSyncedAt) return "Never";
    const now = typeof window !== 'undefined' ? performance.now() : 0;
    const diff = (now > 0 ? Date.now() : Date.now()) - lastSyncedAt.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return lastSyncedAt.toLocaleTimeString();
  }, [lastSyncedAt]);

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
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">{getStatusText()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Network:</span>
              <span className="font-medium">{isOnline ? "Online" : "Offline"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Last sync:</span>
              <span className="font-medium">{formatLastSynced()}</span>
            </div>
            {pendingMutations > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Pending:</span>
                <span className="font-medium">{pendingMutations} changes</span>
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
            {!isOnline ? "Offline mode" :
             isSyncing ? "Syncing..." :
             pendingMutations > 0 ? `${pendingMutations} pending changes` :
             status === "connected" ? "All changes synced" :
             status === "error" ? "Sync error" : "Connecting..."}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
