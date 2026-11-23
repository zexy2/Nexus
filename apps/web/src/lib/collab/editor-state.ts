/**
 * Pure state rules for the collaborative editor: whether editing is allowed
 * and which status to show. Kept separate from the React component so the
 * recovery behaviour can be unit tested.
 */

export type CollabPersistenceStatus = "saving" | "saved" | "error";

export type CollabPersistenceEvent =
  | "local-update"
  | "ack-saved"
  | "ack-error"
  | "resynced";

export function nextPersistenceStatus(
  current: CollabPersistenceStatus,
  event: CollabPersistenceEvent
): CollabPersistenceStatus {
  switch (event) {
    case "local-update":
      return current === "error" ? "error" : "saving";
    case "ack-saved":
      return "saved";
    case "ack-error":
      return "error";
    case "resynced":
      // After a (re)sync the server owns our state again. If a write is still
      // failing it re-sends "error" right after the sync messages.
      return "saved";
  }
}

type CollabEditorMode =
  | "live"
  | "offline"
  | "connecting"
  | "save-error"
  | "unavailable";

interface CollabEditorStateInput {
  editable: boolean;
  isConnected: boolean;
  isSynced: boolean;
  /** The server permanently refused access (no token can be issued). */
  connectionError: boolean;
  persistenceStatus: CollabPersistenceStatus;
  /** The offline (IndexedDB) copy has been loaded. */
  localReady: boolean;
  /** The document has content (locally or from the server). */
  hasLocalContent: boolean;
}

export function getCollabEditorState(input: CollabEditorStateInput): {
  mode: CollabEditorMode;
  canEdit: boolean;
} {
  if (input.connectionError) return { mode: "unavailable", canEdit: false };

  let mode: CollabEditorMode;
  if (input.isConnected && input.persistenceStatus === "error") {
    mode = "save-error";
  } else if (input.isConnected && input.isSynced) {
    mode = "live";
  } else if (!input.isConnected && input.localReady && input.hasLocalContent) {
    // Offline editing is only allowed on top of an existing local copy, so a
    // never-synced (still unseeded) document can't diverge from the server.
    mode = "offline";
  } else {
    mode = "connecting";
  }

  return {
    mode,
    canEdit: input.editable && (mode === "live" || mode === "offline"),
  };
}
