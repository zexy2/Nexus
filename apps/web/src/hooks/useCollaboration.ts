/**
 * useCollaboration Hook
 * 
 * React hook for real-time document collaboration using Yjs.
 * Includes cursor tracking, presence awareness, and activity status.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WebsocketProvider } from "y-websocket";

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

interface CursorPosition {
  index: number;
  length: number;
  blockId?: string;
}

interface UserPresence {
  id: string;
  name: string;
  color: string;
  cursor?: CursorPosition;
  selection?: { start: number; end: number };
  lastActive: number;
  status: "active" | "idle" | "away";
}

interface UseCollaborationOptions {
  docId: string;
  userId: string;
  userName: string;
  userColor?: string;
  enabled?: boolean;
  trackActivity?: boolean;
  onSync?: () => void;
  onUsersChange?: (users: CollaborationUser[]) => void;
  onPresenceChange?: (presences: UserPresence[]) => void;
}

interface UseCollaborationResult {
  isConnected: boolean;
  isSynced: boolean;
  connectedUsers: CollaborationUser[];
  presences: UserPresence[];
  content: unknown[];
  updateContent: (content: unknown[]) => void;
  updateCursor: (position: CursorPosition | null) => void;
  updateSelection: (selection: { start: number; end: number } | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Dynamic import for client-side only
let yjsModule: typeof import("@/lib/yjs") | null = null;

export function useCollaboration(
  options: UseCollaborationOptions
): UseCollaborationResult {
  const {
    docId,
    userId,
    userName,
    userColor,
    enabled = true,
    trackActivity = true,
    onSync,
    onUsersChange,
    onPresenceChange,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<CollaborationUser[]>([]);
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [content, setContent] = useState<unknown[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const providerRef = useRef<WebsocketProvider | null>(null);
  const undoManagerRef = useRef<unknown>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const activityCleanupRef = useRef<(() => void) | null>(null);
  const presenceCleanupRef = useRef<(() => void) | null>(null);

  // Load Yjs module dynamically
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    import("@/lib/yjs").then((mod) => {
      yjsModule = mod;
    });
  }, [enabled]);

  // Connect to collaboration server
  useEffect(() => {
    if (typeof window === "undefined" || !enabled || !yjsModule) return;

    const connect = async () => {
      const mod = await import("@/lib/yjs");

      // Connect to server
      const provider = mod.connectToCollaborationServer(
        docId,
        userId,
        userName,
        userColor
      );

      if (provider) {
        providerRef.current = provider;

        // Get undo manager
        undoManagerRef.current = mod.getUndoManager(docId);

        // Observe content changes
        const unsubscribe = mod.observeYDoc(docId, (newContent) => {
          setContent(newContent);
        });
        unsubscribeRef.current = unsubscribe;

        // Track connection state
        const handleStatus = (event: { status: string }) => {
          setIsConnected(event.status === "connected");
          if (event.status === "connected") {
            setIsSynced(true);
            onSync?.();
          }
        };

        provider.on("status", handleStatus);

        // Track awareness (connected users)
        const handleAwareness = () => {
          const users = mod.getConnectedUsers(docId);
          setConnectedUsers(users);
          onUsersChange?.(users);
        };

        // Listen to awareness changes via the awareness object
        provider.awareness.on("change", handleAwareness);

        // Initial users
        handleAwareness();

        // Subscribe to presence changes (cursors, selections, status)
        const presenceUnsubscribe = mod.subscribeToPresence(docId, (newPresences) => {
          setPresences(newPresences);
          onPresenceChange?.(newPresences);
        });
        presenceCleanupRef.current = presenceUnsubscribe;

        // Start activity tracking if enabled
        if (trackActivity) {
          const activityCleanup = mod.startActivityTracking(docId);
          activityCleanupRef.current = activityCleanup;
        }
      }
    };

    connect();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (presenceCleanupRef.current) {
        presenceCleanupRef.current();
      }
      if (activityCleanupRef.current) {
        activityCleanupRef.current();
      }
      if (yjsModule && docId) {
        yjsModule.disconnectFromCollaborationServer(docId);
      }
    };
  }, [docId, userId, userName, userColor, enabled, trackActivity, onSync, onUsersChange, onPresenceChange]);

  // Update undo/redo state
  useEffect(() => {
    if (!undoManagerRef.current) return;

    const undoManager = undoManagerRef.current as {
      undoStack: unknown[];
      redoStack: unknown[];
      on: (event: string, cb: () => void) => void;
      off: (event: string, cb: () => void) => void;
    };

    const updateStack = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };

    undoManager.on("stack-item-added", updateStack);
    undoManager.on("stack-item-popped", updateStack);

    return () => {
      undoManager.off("stack-item-added", updateStack);
      undoManager.off("stack-item-popped", updateStack);
    };
  }, []);

  // Update content
  const updateContent = useCallback(
    async (newContent: unknown[]) => {
      if (!yjsModule || !docId) return;

      const ydoc = yjsModule.getYDoc(docId);
      yjsModule.applyChangesToYDoc(ydoc, newContent);
    },
    [docId]
  );

  // Update cursor position
  const updateCursor = useCallback(
    (position: CursorPosition | null) => {
      if (!yjsModule || !docId) return;
      yjsModule.updateCursorPosition(docId, position);
    },
    [docId]
  );

  // Update selection
  const updateSelection = useCallback(
    (selection: { start: number; end: number } | null) => {
      if (!yjsModule || !docId) return;
      yjsModule.updateSelection(docId, selection);
    },
    [docId]
  );

  // Undo
  const undo = useCallback(() => {
    const um = undoManagerRef.current as { undo?: () => void } | null;
    if (um?.undo && canUndo) {
      um.undo();
    }
  }, [canUndo]);

  // Redo
  const redo = useCallback(() => {
    const um = undoManagerRef.current as { redo?: () => void } | null;
    if (um?.redo && canRedo) {
      um.redo();
    }
  }, [canRedo]);

  return {
    isConnected,
    isSynced,
    connectedUsers,
    presences,
    content,
    updateContent,
    updateCursor,
    updateSelection,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
