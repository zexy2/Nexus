/**
 * Yjs Real-time Collaboration
 * 
 * Provides CRDT-based real-time collaboration for documents.
 * Uses Yjs for conflict-free document editing.
 */

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { getCollaborationUrl } from "./collaboration-url";

// Store for active documents
const activeDocuments = new Map<string, Y.Doc>();
const activeProviders = new Map<string, WebsocketProvider>();

/**
 * Get or create a Yjs document for a specific document ID
 */
export function getYDoc(docId: string): Y.Doc {
  if (activeDocuments.has(docId)) {
    return activeDocuments.get(docId)!;
  }

  const ydoc = new Y.Doc();
  activeDocuments.set(docId, ydoc);
  return ydoc;
}

/**
 * Get the shared content (XML Fragment) for BlockNote
 */
export function getSharedContent(ydoc: Y.Doc): Y.XmlFragment {
  return ydoc.getXmlFragment("content");
}

/**
 * Get the shared awareness info (cursors, selections)
 */
export function getSharedAwareness(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap("awareness");
}

/**
 * Connect to collaboration server using y-websocket
 */
export function connectToCollaborationServer(
  docId: string,
  userId: string,
  userName: string,
  userColor?: string
): WebsocketProvider | null {
  // Check if already connected
  if (activeProviders.has(docId)) {
    return activeProviders.get(docId)!;
  }

  const ydoc = getYDoc(docId);

  // Get collaboration server URL from environment
  const serverUrl = getCollaborationUrl();

  try {
    const provider = new WebsocketProvider(serverUrl, docId, ydoc);

    // Set user awareness
    provider.awareness.setLocalStateField("user", {
      id: userId,
      name: userName,
      color: userColor || generateUserColor(userId),
    });

    provider.on("status", (event: { status: string }) => {
      console.log(`[Yjs] Connection status: ${event.status}`);
    });

    provider.on("sync", (isSynced: boolean) => {
      if (isSynced) {
        console.log(`[Yjs] Synced document: ${docId}`);
      }
    });

    activeProviders.set(docId, provider);
    return provider;
  } catch (error) {
    console.error("[Yjs] Failed to connect:", error);
    return null;
  }
}

/**
 * Disconnect from collaboration server
 */
export function disconnectFromCollaborationServer(docId: string): void {
  const provider = activeProviders.get(docId);
  if (provider) {
    provider.destroy();
    activeProviders.delete(docId);
  }

  const ydoc = activeDocuments.get(docId);
  if (ydoc) {
    ydoc.destroy();
    activeDocuments.delete(docId);
  }
}

/**
 * Get all connected users for a document
 */
export function getConnectedUsers(
  docId: string
): Array<{ id: string; name: string; color: string }> {
  const provider = activeProviders.get(docId);
  if (!provider) return [];

  const users: Array<{ id: string; name: string; color: string }> = [];
  const awareness = provider.awareness;

  if (!awareness) return users;

  awareness.getStates().forEach((state) => {
    if (state.user) {
      users.push(state.user as { id: string; name: string; color: string });
    }
  });

  return users;
}

/**
 * Generate a consistent color based on user ID
 */
function generateUserColor(userId: string): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8B500", "#2ECC71",
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Apply local changes from BlockNote to Yjs
 */
export function applyChangesToYDoc(
  ydoc: Y.Doc,
  content: unknown[]
): void {
  const sharedContent = getSharedContent(ydoc);

  ydoc.transact(() => {
    // Clear existing content
    while (sharedContent.length > 0) {
      sharedContent.delete(0);
    }

    // Convert BlockNote content to Y.XmlElement
    for (const block of content) {
      const element = blockToYXml(block as BlockData);
      if (element) {
        sharedContent.push([element]);
      }
    }
  });
}

interface BlockData {
  type: string;
  content?: Array<{ type?: string; text?: string }>;
  props?: Record<string, unknown>;
  children?: BlockData[];
}

/**
 * Convert a BlockNote block to Y.XmlElement
 */
function blockToYXml(block: BlockData): Y.XmlElement | null {
  if (!block || !block.type) return null;

  const element = new Y.XmlElement(block.type);

  // Add props as attributes
  if (block.props) {
    for (const [key, value] of Object.entries(block.props)) {
      element.setAttribute(key, String(value));
    }
  }

  // Add content as text
  if (block.content && Array.isArray(block.content)) {
    for (const item of block.content) {
      if (item.type === "text" && item.text) {
        element.insert(element.length, [new Y.XmlText(item.text)]);
      }
    }
  }

  // Add children recursively
  if (block.children && Array.isArray(block.children)) {
    for (const child of block.children) {
      const childElement = blockToYXml(child);
      if (childElement) {
        element.insert(element.length, [childElement]);
      }
    }
  }

  return element;
}

/**
 * Convert Yjs content back to BlockNote format
 */
export function yDocToBlockNote(ydoc: Y.Doc): unknown[] {
  const sharedContent = getSharedContent(ydoc);
  const blocks: unknown[] = [];

  sharedContent.forEach((item) => {
    if (item instanceof Y.XmlElement) {
      blocks.push(yXmlToBlock(item));
    }
  });

  return blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }];
}

/**
 * Convert Y.XmlElement to BlockNote block
 */
function yXmlToBlock(element: Y.XmlElement): unknown {
  const block: BlockData = {
    type: element.nodeName,
    props: {},
    content: [],
    children: [],
  };

  // Get attributes as props
  const attrs = element.getAttributes();
  for (const [key, value] of Object.entries(attrs)) {
    block.props![key] = value;
  }

  // Get text content
  element.forEach((item) => {
    if (item instanceof Y.XmlText) {
      block.content!.push({ type: "text", text: item.toString() });
    } else if (item instanceof Y.XmlElement) {
      block.children!.push(yXmlToBlock(item) as BlockData);
    }
  });

  return block;
}

/**
 * Observe changes in Yjs document
 */
export function observeYDoc(
  docId: string,
  callback: (content: unknown[]) => void
): () => void {
  const ydoc = getYDoc(docId);
  const sharedContent = getSharedContent(ydoc);

  const observer = () => {
    callback(yDocToBlockNote(ydoc));
  };

  sharedContent.observeDeep(observer);

  return () => {
    sharedContent.unobserveDeep(observer);
  };
}

/**
 * Get undo/redo manager for a document
 */
export function getUndoManager(docId: string): Y.UndoManager {
  const ydoc = getYDoc(docId);
  const sharedContent = getSharedContent(ydoc);
  return new Y.UndoManager(sharedContent);
}

// =============================================================================
// CURSOR & PRESENCE TRACKING
// =============================================================================

export interface CursorPosition {
  index: number;
  length: number;
  blockId?: string;
}

export interface UserPresence {
  id: string;
  name: string;
  color: string;
  cursor?: CursorPosition;
  selection?: { start: number; end: number };
  lastActive: number;
  status: "active" | "idle" | "away";
}

/**
 * Update current user's cursor position in awareness
 */
export function updateCursorPosition(
  docId: string,
  position: CursorPosition | null
): void {
  const provider = activeProviders.get(docId);
  if (!provider?.awareness) return;

  const currentState = provider.awareness.getLocalState() as Record<string, unknown> || {};
  provider.awareness.setLocalState({
    ...currentState,
    cursor: position,
    lastActive: Date.now(),
    status: "active",
  });
}

/**
 * Update current user's selection in awareness
 */
export function updateSelection(
  docId: string,
  selection: { start: number; end: number } | null
): void {
  const provider = activeProviders.get(docId);
  if (!provider?.awareness) return;

  const currentState = provider.awareness.getLocalState() as Record<string, unknown> || {};
  provider.awareness.setLocalState({
    ...currentState,
    selection,
    lastActive: Date.now(),
    status: "active",
  });
}

/**
 * Update user activity status
 */
export function updateUserStatus(
  docId: string,
  status: "active" | "idle" | "away"
): void {
  const provider = activeProviders.get(docId);
  if (!provider?.awareness) return;

  const currentState = provider.awareness.getLocalState() as Record<string, unknown> || {};
  provider.awareness.setLocalState({
    ...currentState,
    status,
    lastActive: Date.now(),
  });
}

/**
 * Get all users' presence information including cursors
 */
export function getAllPresence(docId: string): UserPresence[] {
  const provider = activeProviders.get(docId);
  if (!provider?.awareness) return [];

  const presences: UserPresence[] = [];
  const states = provider.awareness.getStates();

  states.forEach((state) => {
    const userState = state as Record<string, unknown>;
    if (userState?.user) {
      const user = userState.user as { id: string; name: string; color: string };
      presences.push({
        id: user.id,
        name: user.name,
        color: user.color,
        cursor: userState.cursor as CursorPosition | undefined,
        selection: userState.selection as { start: number; end: number } | undefined,
        lastActive: (userState.lastActive as number) || Date.now(),
        status: (userState.status as "active" | "idle" | "away") || "active",
      });
    }
  });

  return presences;
}

/**
 * Subscribe to presence changes
 */
export function subscribeToPresence(
  docId: string,
  callback: (presences: UserPresence[]) => void
): () => void {
  const provider = activeProviders.get(docId);
  if (!provider?.awareness) return () => {};

  const awareness = provider.awareness;

  const handler = () => {
    callback(getAllPresence(docId));
  };

  awareness.on("change", handler);

  // Initial call
  handler();

  return () => {
    awareness.off("change", handler);
  };
}

/**
 * Get cursor decorations for rendering
 */
export function getCursorDecorations(docId: string): Array<{
  userId: string;
  userName: string;
  color: string;
  position: CursorPosition;
}> {
  const presences = getAllPresence(docId);
  const provider = activeProviders.get(docId);
  const localClientId = provider?.awareness?.clientID;

  return presences
    .filter((p) => p.cursor && p.id !== String(localClientId))
    .map((p) => ({
      userId: p.id,
      userName: p.name,
      color: p.color,
      position: p.cursor!,
    }));
}

/**
 * Auto-detect idle/away status based on activity
 */
export function startActivityTracking(docId: string): () => void {
  const IDLE_TIMEOUT = 60000; // 1 minute
  const AWAY_TIMEOUT = 300000; // 5 minutes

  let lastActivity = Date.now();

  const updateActivity = () => {
    const now = Date.now();
    const timeSinceActive = now - lastActivity;

    if (timeSinceActive > AWAY_TIMEOUT) {
      updateUserStatus(docId, "away");
    } else if (timeSinceActive > IDLE_TIMEOUT) {
      updateUserStatus(docId, "idle");
    }
  };

  const handleUserActivity = () => {
    lastActivity = Date.now();
    updateUserStatus(docId, "active");
  };

  // Listen for user activity
  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("click", handleUserActivity);
    window.addEventListener("scroll", handleUserActivity);
  }

  // Check periodically
  const intervalId = setInterval(updateActivity, 30000);

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
    }
    clearInterval(intervalId);
  };
}
