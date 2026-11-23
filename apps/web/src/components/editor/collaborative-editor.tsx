"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Collaborative Editor with Yjs CRDT
 * 
 * Real-time collaboration with cursor tracking using:
 * - BlockNote for rich text editing
 * - Yjs for CRDT-based conflict resolution
 * - WebSocket for real-time sync
 * 
 * Note: This component intentionally uses setState in effects for:
 * 1. Setting provider state after WebSocket connection is established
 * 2. Loading initial content into Yjs document when synced
 * 3. Tracking connected users via awareness protocol
 * These are valid patterns for external system synchronization.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { PartialBlock } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as decoding from "lib0/decoding";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Wifi, WifiOff, Users, Circle, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { getCollaborationUrl } from "@/lib/sync/collaboration-url";
import {
  attachCollabTokenRefresh,
  fetchCollabToken,
} from "@/lib/collab/token-refresh";
import { openCollabOfflineStore } from "@/lib/collab/offline-store";
import { setCollabDocUnsynced } from "@/lib/collab/unsynced";
import { seedFragmentIfEmpty } from "@/lib/collab/seed";
import {
  type CollabPersistenceEvent,
  type CollabPersistenceStatus,
  getCollabEditorState,
  nextPersistenceStatus,
} from "@/lib/collab/editor-state";

interface CollaborativeEditorProps {
  documentId: string;
  userId: string;
  userName: string;
  userColor?: string;
  initialContent?: PartialBlock[];
  onChange?: (content: PartialBlock[]) => void;
  editable?: boolean;
}

interface ConnectedUser {
  clientId: number;
  id: string;
  name: string;
  color: string;
  status?: "active" | "idle" | "away";
}

// User colors - stable per user
const USER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", 
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F8B500", "#00CED1"
];

function getStableUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// Inner component that creates editor AFTER provider is ready
function CollaborativeEditorInner({
  provider,
  fragment,
  ydoc,
  userName,
  userColor,
  initialContent,
  onChange,
  editable,
  isConnected,
  isSynced,
  connectedUsers,
  connectionError,
  persistenceStatus,
  localReady,
  hasLocalContent,
}: {
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
  ydoc: Y.Doc;
  userName: string;
  userColor: string;
  initialContent?: PartialBlock[];
  onChange?: (content: PartialBlock[]) => void;
  editable: boolean;
  isConnected: boolean;
  isSynced: boolean;
  connectedUsers: ConnectedUser[];
  connectionError: boolean;
  persistenceStatus: CollabPersistenceStatus;
  localReady: boolean;
  hasLocalContent: boolean;
}) {
  const t = useT();
  const [contentLoaded, setContentLoaded] = useState(false);
  const editorPlaceholder = t("docs.detail.editorPlaceholder");
  
  // Create BlockNote editor WITH provider ready
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        provider: provider,
        fragment: fragment,
        user: {
          name: userName,
          color: userColor,
        },
      },
      placeholders: {
        default: editorPlaceholder,
        emptyDocument: editorPlaceholder,
      },
    }),
    [editorPlaceholder]
  );

  // Seed the materialized content into Yjs if the document is still empty
  // after the server sync. Seeding is deterministic (content-derived Yjs ids),
  // so concurrent first opens by several users insert the body only once.
  useEffect(() => {
    if (isSynced && !contentLoaded) {
      if (seedFragmentIfEmpty(ydoc, editor, initialContent)) {
        console.log("[Collab] Seeded empty Yjs document from saved content");
      }
      setContentLoaded(true);
    }
  }, [isSynced, contentLoaded, initialContent, ydoc, editor]);

  const { mode, canEdit } = getCollabEditorState({
    editable,
    isConnected,
    isSynced,
    connectionError,
    persistenceStatus,
    localReady,
    hasLocalContent: hasLocalContent || fragment.length > 0,
  });

  const handleChange = useCallback(() => {
    if (onChange) {
      onChange(editor.document);
    }
  }, [editor, onChange]);

  return (
    <div className="relative">
      {/* Collaboration Status Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-t-xl border-x border-t border-b border-white/[0.06] bg-card">
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
            {isConnected ? (
              <>
                <Wifi className="size-3" />
                <span>{t("docs.detail.collabConnected")}</span>
              </>
            ) : (
              <>
                <WifiOff className="size-3" />
                <span>
                  {mode === "offline"
                    ? t("docs.detail.collabOffline")
                    : mode === "connecting"
                      ? t("docs.detail.collabReconnecting")
                      : t("docs.detail.collabUnavailable")}
                </span>
              </>
            )}
          </Badge>

          {isConnected && (
            <Badge
              variant={
                persistenceStatus === "error"
                  ? "destructive"
                  : isSynced && persistenceStatus === "saved"
                    ? "outline"
                    : "secondary"
              }
              className="gap-1"
            >
              {persistenceStatus === "error"
                ? t("docs.detail.collabSaveError")
                : isSynced && persistenceStatus === "saved"
                  ? t("docs.detail.collabSynced")
                  : t("docs.detail.collabSyncing")}
            </Badge>
          )}
        </div>

        {/* Connected Users */}
        <div className="flex items-center gap-3">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {connectedUsers.length} {t("docs.detail.collabOnlineCount")}
              </span>
              <div className="flex -space-x-1 ml-1">
                {connectedUsers.slice(0, 6).map((user) => (
                  <Tooltip key={user.clientId}>
                    <TooltipTrigger asChild>
                      <div className="relative cursor-pointer">
                        <Avatar 
                          className="size-8 border-2 transition-transform hover:scale-110 hover:z-10"
                          style={{ borderColor: user.color }}
                        >
                          <AvatarFallback 
                            style={{ backgroundColor: user.color }}
                            className="text-white text-xs font-semibold"
                          >
                            {user.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <Circle 
                          className={`absolute -bottom-0.5 -right-0.5 size-3 fill-current stroke-background stroke-2 ${
                            user.status === "active" ? "text-green-500" :
                            user.status === "idle" ? "text-yellow-500" :
                            "text-gray-400"
                          }`}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="size-3 rounded-full" 
                          style={{ backgroundColor: user.color }}
                        />
                        <div>
                          <p className="font-semibold">{user.name}</p>
                          <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                            <Circle 
                              className={`size-2 fill-current ${
                                user.status === "active" ? "text-green-500" :
                                user.status === "idle" ? "text-yellow-500" :
                                "text-gray-400"
                              }`}
                            />
                            {t(`docs.detail.collab${
                              user.status === "idle"
                                ? "Idle"
                                : user.status === "away"
                                  ? "Away"
                                  : "Active"
                            }`)}
                          </p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {connectedUsers.length > 6 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Avatar className="size-8 border-2 border-muted-foreground">
                        <AvatarFallback className="text-xs bg-muted font-semibold">
                          +{connectedUsers.length - 6}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>
                        {connectedUsers.length - 6}{" "}
                        {t("docs.detail.collabMoreUsers")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Editor with cursor styles */}
      <div className="min-h-[600px] rounded-b-xl border-x border-b border-white/[0.06] bg-card">
        <style>{`
          .bn-container .collaboration-cursor__caret {
            position: relative;
            margin-left: -1px;
            margin-right: -1px;
            border-left: 2px solid;
            border-right: none;
            word-break: normal;
            pointer-events: none;
          }
          .bn-container .collaboration-cursor__label {
            position: absolute;
            top: -1.4em;
            left: -1px;
            font-size: 12px;
            font-weight: 600;
            font-style: normal;
            white-space: nowrap;
            color: white;
            padding: 2px 6px;
            border-radius: 4px 4px 4px 0;
            user-select: none;
            pointer-events: none;
          }
          .bn-container [data-collaboration-cursor] {
            position: relative;
          }
          .bn-container [data-collaboration-cursor]::after {
            content: attr(data-collaboration-cursor-name);
            position: absolute;
            top: -1.4em;
            left: 0;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            color: white;
            padding: 2px 6px;
            border-radius: 4px 4px 4px 0;
            pointer-events: none;
          }
        `}</style>
        <BlockNoteView
          editor={editor}
          editable={canEdit}
          onChange={handleChange}
          theme="dark"
          className="py-8"
        />
      </div>

      {mode !== "live" && (
        <div
          role="status"
          className={
            mode === "offline"
              ? "mt-3 rounded-lg border border-white/10 bg-muted/40 px-4 py-3"
              : "mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
          }
        >
          <div
            className={`flex items-start gap-2 text-sm ${
              mode === "offline" ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {mode === "connecting" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            ) : (
              <WifiOff className="mt-0.5 size-4 shrink-0" />
            )}
            <div>
              <p className="font-medium">
                {mode === "offline"
                  ? t("docs.detail.collabOffline")
                  : mode === "save-error"
                    ? t("docs.detail.collabSaveError")
                    : mode === "connecting"
                      ? t("docs.detail.collabReconnecting")
                      : t("docs.detail.collabUnavailable")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === "offline"
                  ? t("docs.detail.collabOfflineDesc")
                  : mode === "save-error"
                    ? t("docs.detail.collabSaveErrorDesc")
                    : t("docs.detail.collabUnavailableDesc")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main component - creates provider first, then renders editor
export function CollaborativeEditor({
  documentId,
  userId,
  userName,
  userColor,
  initialContent,
  onChange,
  editable = true,
}: CollaborativeEditorProps) {
  const t = useT();
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<CollabPersistenceStatus>("saved");
  const [localReady, setLocalReady] = useState(false);
  const [hasLocalContent, setHasLocalContent] = useState(false);
  
  const stableUserColor = useMemo(
    () => userColor || getStableUserColor(userId), 
    [userId, userColor]
  );

  // Create Yjs document
  const ydoc = useMemo(() => new Y.Doc(), []);
  const fragment = useMemo(() => ydoc.getXmlFragment("document"), [ydoc]);

  // Setup offline persistence and the WebSocket connection. The provider is
  // created right away (so a locally cached copy can be edited offline) and
  // connects once a short-lived, document-scoped token has been fetched (the
  // server checks the session and the user's access to this doc). The token is
  // refreshed before it expires and whenever a reconnect needs a new one, so
  // long-lived sessions survive laptop sleep and network drops.
  useEffect(() => {
    const wsUrl = getCollaborationUrl();
    let cancelled = false;

    const offlineStore = openCollabOfflineStore(userId, documentId, ydoc);
    if (offlineStore) {
      void offlineStore.whenSynced.then(() => {
        if (cancelled) return;
        setHasLocalContent(fragment.length > 0);
        setLocalReady(true);
      });
    }

    const provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
      connect: false,
      params: {},
    });

    const tokenRefresh = attachCollabTokenRefresh(provider, {
      fetchToken: () => fetchCollabToken(documentId),
      onFatalError: (error) => {
        console.error("[Collab] Token request rejected:", error.status);
        if (!cancelled) setConnectionError(true);
      },
    });

    const applyPersistenceEvent = (event: CollabPersistenceEvent) => {
      queueMicrotask(() => {
        if (!cancelled) {
          setPersistenceStatus((current) => nextPersistenceStatus(current, event));
        }
      });
    };

    provider.messageHandlers[4] = (_encoder, decoder) => {
      const status = decoding.readVarString(decoder);
      applyPersistenceEvent(status === "saved" ? "ack-saved" : "ack-error");
    };

    const handleDocumentUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== provider && origin !== offlineStore) {
        applyPersistenceEvent("local-update");
      }
    };
    ydoc.on("update", handleDocumentUpdate);

    provider.awareness.setLocalStateField("user", {
      id: userId,
      name: userName,
      color: stableUserColor,
    });

    provider.on("status", (event: { status: string }) => {
      if (!cancelled) setIsConnected(event.status === "connected");
    });

    const onProviderEvent = provider.on.bind(provider) as (
      event: string,
      callback: (value: boolean) => void
    ) => void;
    onProviderEvent("synced", (synced: boolean) => {
      if (cancelled) return;
      setIsSynced(synced);
      if (synced) applyPersistenceEvent("resynced");
    });

    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const users: ConnectedUser[] = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          users.push({
            clientId,
            id: state.user.id,
            name: state.user.name,
            color: state.user.color,
            status: state.status || "active",
          });
        }
      });
      queueMicrotask(() => {
        if (!cancelled) setConnectedUsers(users);
      });
    };

    provider.awareness.on("change", handleAwarenessChange);
    handleAwarenessChange();

    setProvider(provider);
    void tokenRefresh.start();

    return () => {
      cancelled = true;
      tokenRefresh.dispose();
      ydoc.off("update", handleDocumentUpdate);
      provider.awareness.off("change", handleAwarenessChange);
      provider.disconnect();
      provider.destroy();
      void offlineStore?.destroy();
      ydoc.destroy();
    };
  }, [documentId, userId, userName, stableUserColor, ydoc, fragment]);

  // Report unconfirmed edits so sign-out can warn before deleting the
  // offline copy.
  useEffect(() => {
    setCollabDocUnsynced(documentId, persistenceStatus !== "saved");
    return () => setCollabDocUnsynced(documentId, false);
  }, [documentId, persistenceStatus]);

  // Show loading until provider is ready
  if (!provider) {
    return (
      <div className="min-h-[550px] rounded-lg border bg-muted/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {connectionError
              ? t("docs.detail.collabUnavailable")
              : t("docs.detail.collabConnecting")}
          </span>
          {connectionError && (
            <span className="max-w-md text-center text-xs text-destructive">
              {t("docs.detail.collabUnavailableDesc")}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <CollaborativeEditorInner
      provider={provider}
      fragment={fragment}
      ydoc={ydoc}
      userName={userName}
      userColor={stableUserColor}
      initialContent={initialContent}
      onChange={onChange}
      editable={editable}
      isConnected={isConnected}
      isSynced={isSynced}
      connectedUsers={connectedUsers}
      connectionError={connectionError}
      persistenceStatus={persistenceStatus}
      localReady={localReady}
      hasLocalContent={hasLocalContent}
    />
  );
}

// SSR-safe wrapper using next/dynamic
export const CollaborativeEditorWrapper = dynamic(
  () => Promise.resolve(CollaborativeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[550px] rounded-lg border bg-background animate-pulse" />
    ),
  }
);
