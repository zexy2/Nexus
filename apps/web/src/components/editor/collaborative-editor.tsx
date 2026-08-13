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
  persistenceStatus: "saving" | "saved" | "error";
}) {
  const t = useT();
  const [contentLoaded, setContentLoaded] = useState(false);
  const editorPlaceholder = t("docs.detail.editorPlaceholder");
  
  // Create BlockNote editor WITH provider ready
  const editor = useCreateBlockNote(
    {
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
    },
    [editorPlaceholder]
  );

  // Load initial content into Yjs if the document is empty after sync
  useEffect(() => {
    if (isSynced && !contentLoaded && initialContent && initialContent.length > 0) {
      // Check if the Yjs document is empty
      const xmlContent = fragment.toArray();
      if (xmlContent.length === 0) {
        console.log("[Collab] Loading initial content into empty Yjs document");
        // Insert initial content blocks
        editor.replaceBlocks(editor.document, initialContent);
        setContentLoaded(true);
      } else {
        setContentLoaded(true);
      }
    }
  }, [isSynced, contentLoaded, initialContent, fragment, editor]);

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
                <span>{t("docs.detail.collabUnavailable")}</span>
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
                ? t("docs.detail.collabUnavailable")
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
          editable={
            editable &&
            isConnected &&
            isSynced &&
            !connectionError &&
            persistenceStatus !== "error"
          }
          onChange={handleChange}
          theme="dark"
          className="py-8"
        />
      </div>

      {(!isConnected || connectionError || persistenceStatus === "error") && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{t("docs.detail.collabUnavailable")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("docs.detail.collabUnavailableDesc")}
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
  const [persistenceStatus, setPersistenceStatus] = useState<
    "saving" | "saved" | "error"
  >("saved");
  
  const stableUserColor = useMemo(
    () => userColor || getStableUserColor(userId), 
    [userId, userColor]
  );

  // Create Yjs document
  const ydoc = useMemo(() => new Y.Doc(), []);
  const fragment = useMemo(() => ydoc.getXmlFragment("document"), [ydoc]);

  // Setup WebSocket connection. We first fetch a short-lived, document-scoped
  // token (the server checks the session and the user's access to this doc) and
  // pass it to the collaboration server, which rejects connections without a
  // valid token. This keeps realtime access aligned with the REST authorization.
  useEffect(() => {
    const wsUrl = getCollaborationUrl();
    let wsProvider: WebsocketProvider | null = null;
    let handleDocumentUpdate:
      | ((_update: Uint8Array, origin: unknown) => void)
      | null = null;
    let cancelled = false;

    void (async () => {
      let token: string | null = null;
      try {
        const res = await fetch(`/api/collab/token?docId=${encodeURIComponent(documentId)}`);
        if (res.ok) {
          token = (await res.json())?.token ?? null;
        } else {
          console.error("[Collab] Token request rejected:", res.status);
          setConnectionError(true);
        }
      } catch (err) {
        console.error("[Collab] Token request failed:", err);
        setConnectionError(true);
      }

      if (cancelled || !token) {
        if (!cancelled) {
          setConnectionError(true);
        }
        return;
      }

      const provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
        connect: true,
        params: { token },
      });
      wsProvider = provider;

      provider.messageHandlers[4] = (_encoder, decoder) => {
        const status = decoding.readVarString(decoder);
        queueMicrotask(() => {
          if (!cancelled) {
            setPersistenceStatus(status === "saved" ? "saved" : "error");
          }
        });
      };

      handleDocumentUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin !== provider) {
          queueMicrotask(() => {
            if (!cancelled) setPersistenceStatus("saving");
          });
        }
      };
      ydoc.on("update", handleDocumentUpdate);

      provider.awareness.setLocalStateField("user", {
        id: userId,
        name: userName,
        color: stableUserColor,
      });

      provider.on("status", (event: { status: string }) => {
        setIsConnected(event.status === "connected");
        if (event.status === "connected") setConnectionError(false);
      });

      const onProviderEvent = provider.on.bind(provider) as (
        event: string,
        callback: (value: boolean) => void
      ) => void;
      onProviderEvent("synced", (synced: boolean) => {
        setIsSynced(synced);
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
    })();

    return () => {
      cancelled = true;
      if (wsProvider) {
        if (handleDocumentUpdate) {
          ydoc.off("update", handleDocumentUpdate);
        }
        wsProvider.disconnect();
        wsProvider.destroy();
      }
      ydoc.destroy();
    };
  }, [documentId, userId, userName, stableUserColor, ydoc]);

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
