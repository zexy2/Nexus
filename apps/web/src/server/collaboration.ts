/**
 * Persistent Y-WebSocket collaboration server (production entry point).
 *
 * Yjs remains the source of truth for document bodies. Every update is appended
 * to Postgres and periodically compacted into a snapshot so process and
 * container restarts do not lose collaborative edits. The transport and room
 * logic live in `collaboration-server.ts`; storage in
 * `collaboration-persistence.ts`.
 */

import { getDb } from "@nexus/database";
import { createCollaborationServer } from "./collaboration-server";
import { createPostgresCollabPersistence } from "./collaboration-persistence";

const PORT = Number.parseInt(process.env.COLLABORATION_PORT || "1234", 10);
const HOST = process.env.COLLABORATION_HOST || "localhost";
const AUTH_SECRET = process.env.COLLAB_AUTH_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const SNAPSHOT_UPDATE_THRESHOLD = Number.parseInt(
  process.env.YJS_SNAPSHOT_UPDATE_THRESHOLD || "100",
  10
);
const SNAPSHOT_INTERVAL_MS = Number.parseInt(
  process.env.YJS_SNAPSHOT_INTERVAL_MS || "30000",
  10
);
const MAX_WEBSOCKET_PAYLOAD_BYTES = Number.parseInt(
  process.env.COLLAB_MAX_PAYLOAD_BYTES || String(1024 * 1024),
  10
);

if (!AUTH_SECRET) {
  console.error(
    "[Collab] FATAL: COLLAB_AUTH_SECRET is not set. Refusing to start."
  );
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error(
    "[Collab] FATAL: DATABASE_URL is not set. Persistent collaboration is required."
  );
  process.exit(1);
}

const persistence = createPostgresCollabPersistence(getDb(DATABASE_URL));
const server = createCollaborationServer({
  authSecret: AUTH_SECRET,
  persistence,
  snapshotUpdateThreshold: SNAPSHOT_UPDATE_THRESHOLD,
  snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
  maxPayloadBytes: MAX_WEBSOCKET_PAYLOAD_BYTES,
});

void server.listen(PORT, HOST).then(() => {
  console.log(
    `[Collab] Listening on ws://${HOST}:${PORT} with Postgres persistence`
  );
  void persistence
    .healthCheck?.()
    .then(server.markPersistenceHealthy)
    .catch(server.markPersistenceError);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[Collab] Shutting down...");
  try {
    await server.shutdown();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
