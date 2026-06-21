/**
 * Persistent Y-WebSocket collaboration server.
 *
 * Yjs remains the source of truth for document bodies. Every update is appended
 * to Postgres and periodically compacted into a snapshot so process and
 * container restarts do not lose collaborative edits.
 */

import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import {
  documentYjsSnapshots,
  documentYjsUpdates,
  docs as docsTable,
  getDb,
} from "@nexus/database";
import {
  type CollabTokenPayload,
  verifyCollabToken,
} from "../lib/collab-token";

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
const DOC_CLEANUP_DELAY = 5 * 60 * 1000;
const HYDRATE_ORIGIN = Symbol("postgres-hydration");

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

const db = getDb(DATABASE_URL);
const messageSync = 0;
const messageAwareness = 1;
const messagePersistence = 4;
const activeDocs = new Map<string, WSSharedDoc>();
const docLoads = new Map<string, Promise<WSSharedDoc>>();
const docCleanupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

let persistenceStatus: "postgres" | "unavailable" = "postgres";
let persistenceError: string | null = null;

function markPersistenceError(error: unknown) {
  persistenceStatus = "unavailable";
  persistenceError =
    error instanceof Error ? error.message : "Unknown persistence error";
  console.error("[Collab] Persistence error:", error);
}

function markPersistenceHealthy() {
  persistenceStatus = "postgres";
  persistenceError = null;
}

function parseAuthorizedRequest(
  reqUrl: string | undefined,
  host: string | undefined
): { docName: string; payload: CollabTokenPayload } | null {
  try {
    const url = new URL(reqUrl || "/", `http://${host || "localhost"}`);
    const docName = url.pathname.replace(/^\//, "") || "default";
    const token = url.searchParams.get("token");
    if (!token) return null;

    const payload = verifyCollabToken(token, AUTH_SECRET as string);
    if (!payload || payload.d !== docName) return null;

    return { docName, payload };
  } catch {
    return null;
  }
}

function toUint8Array(value: Buffer | Uint8Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function extractMaterializedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractMaterializedText).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directText = typeof record.text === "string" ? record.text : "";
    const nested = Object.entries(record)
      .filter(([key]) => key !== "text")
      .map(([, entry]) => extractMaterializedText(entry))
      .filter(Boolean)
      .join("\n");
    return [directText, nested].filter(Boolean).join("\n");
  }
  return "";
}

class WSSharedDoc extends Y.Doc {
  readonly name: string;
  readonly workspaceId: string;
  readonly awareness: awarenessProtocol.Awareness;
  readonly conns = new Map<WebSocket, Set<number>>();
  readonly connectionUsers = new Map<WebSocket, string | null>();

  private persistenceReady = false;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private updatesSinceSnapshot = 0;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  constructor(name: string, workspaceId: string) {
    super({ gc: true });
    this.name = name;
    this.workspaceId = workspaceId;
    this.awareness = new awarenessProtocol.Awareness(this);

    this.awareness.on(
      "update",
      ({
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        const changedClients = added.concat(updated).concat(removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            this.awareness,
            changedClients
          )
        );
        const message = encoding.toUint8Array(encoder);
        this.conns.forEach((_, conn) => send(this, conn, message));
      }
    );

    this.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      this.conns.forEach((_, conn) => {
        if (origin !== conn) send(this, conn, message);
      });

      if (!this.persistenceReady || origin === HYDRATE_ORIGIN) return;
      const actorUserId =
        origin instanceof WebSocket
          ? this.connectionUsers.get(origin) ?? null
          : null;
      this.queueUpdate(
        update,
        actorUserId,
        origin instanceof WebSocket ? origin : null
      );
    });
  }

  enablePersistence(updateCount: number) {
    this.persistenceReady = true;
    this.updatesSinceSnapshot = updateCount;
    this.snapshotTimer = setInterval(() => {
      if (this.updatesSinceSnapshot > 0) {
        this.enqueue(async () => this.writeSnapshot());
      }
    }, SNAPSHOT_INTERVAL_MS);
    this.snapshotTimer.unref();
  }

  private enqueue(task: () => Promise<void>, ackConnection?: WebSocket | null) {
    this.persistenceQueue = this.persistenceQueue
      .then(task)
      .then(() => {
        markPersistenceHealthy();
        if (ackConnection) {
          sendPersistenceStatus(this, ackConnection, "saved");
        }
      })
      .catch((error) => {
        markPersistenceError(error);
        if (ackConnection) {
          sendPersistenceStatus(this, ackConnection, "error");
        }
      });
    return this.persistenceQueue;
  }

  private queueUpdate(
    update: Uint8Array,
    actorUserId: string | null,
    ackConnection: WebSocket | null
  ) {
    const persistedUpdate = Buffer.from(update);
    this.enqueue(
      async () => {
        await db.insert(documentYjsUpdates).values({
          docId: this.name,
          workspaceId: this.workspaceId,
          actorUserId,
          update: persistedUpdate,
        });

        this.updatesSinceSnapshot += 1;
        if (this.updatesSinceSnapshot >= SNAPSHOT_UPDATE_THRESHOLD) {
          await this.writeSnapshot();
        }
      },
      ackConnection
    );
  }

  private async writeSnapshot() {
    if (this.updatesSinceSnapshot === 0) return;

    const [latestUpdate] = await db
      .select({ sequence: documentYjsUpdates.sequence })
      .from(documentYjsUpdates)
      .where(eq(documentYjsUpdates.docId, this.name))
      .orderBy(desc(documentYjsUpdates.sequence))
      .limit(1);

    if (!latestUpdate) return;

    const [materializedDoc] = await db
      .select({ content: docsTable.content })
      .from(docsTable)
      .where(eq(docsTable.id, this.name))
      .limit(1);

    const state = Buffer.from(Y.encodeStateAsUpdate(this));
    const stateVector = Buffer.from(Y.encodeStateVector(this));
    const updateCount = this.updatesSinceSnapshot;
    const materializedContent = materializedDoc?.content ?? null;

    await db
      .insert(documentYjsSnapshots)
      .values({
        docId: this.name,
        workspaceId: this.workspaceId,
        state,
        stateVector,
        updateCount,
        lastSequence: latestUpdate.sequence,
        materializedContent,
        materializedText: extractMaterializedText(materializedContent),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: documentYjsSnapshots.docId,
        set: {
          state,
          stateVector,
          updateCount,
          lastSequence: latestUpdate.sequence,
          materializedContent,
          materializedText: extractMaterializedText(materializedContent),
          updatedAt: new Date(),
        },
      });

    await db
      .delete(documentYjsUpdates)
      .where(
        and(
          eq(documentYjsUpdates.docId, this.name),
          lte(documentYjsUpdates.sequence, latestUpdate.sequence)
        )
      );

    this.updatesSinceSnapshot = 0;
    console.log(
      `[Collab] Snapshot saved: ${this.name} at sequence ${latestUpdate.sequence}`
    );
  }

  async flushPersistence() {
    if (this.updatesSinceSnapshot > 0) {
      this.enqueue(async () => this.writeSnapshot());
    }
    await this.persistenceQueue;
  }

  stopPersistence() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }
}

async function hydrateDocument(docName: string): Promise<WSSharedDoc> {
  const [docRow] = await db
    .select({ workspaceId: docsTable.workspaceId })
    .from(docsTable)
    .where(eq(docsTable.id, docName))
    .limit(1);

  if (!docRow) {
    throw new Error(`Document not found: ${docName}`);
  }

  const doc = new WSSharedDoc(docName, docRow.workspaceId);
  const [snapshot] = await db
    .select()
    .from(documentYjsSnapshots)
    .where(eq(documentYjsSnapshots.docId, docName))
    .limit(1);

  let lastSequence = 0;
  if (snapshot) {
    Y.applyUpdate(doc, toUint8Array(snapshot.state), HYDRATE_ORIGIN);
    lastSequence = snapshot.lastSequence;
  }

  const updates = await db
    .select({
      update: documentYjsUpdates.update,
      sequence: documentYjsUpdates.sequence,
    })
    .from(documentYjsUpdates)
    .where(
      and(
        eq(documentYjsUpdates.docId, docName),
        gt(documentYjsUpdates.sequence, lastSequence)
      )
    )
    .orderBy(documentYjsUpdates.sequence);

  for (const row of updates) {
    Y.applyUpdate(doc, toUint8Array(row.update), HYDRATE_ORIGIN);
  }

  doc.enablePersistence(updates.length);
  markPersistenceHealthy();
  console.log(
    `[Collab] Hydrated document: ${docName} (snapshot=${Boolean(snapshot)}, updates=${updates.length})`
  );
  return doc;
}

async function getYDoc(docName: string): Promise<WSSharedDoc> {
  const cleanup = docCleanupTimeouts.get(docName);
  if (cleanup) {
    clearTimeout(cleanup);
    docCleanupTimeouts.delete(docName);
  }

  const active = activeDocs.get(docName);
  if (active) return active;

  const pending = docLoads.get(docName);
  if (pending) return pending;

  const load = hydrateDocument(docName)
    .then((doc) => {
      activeDocs.set(docName, doc);
      return doc;
    })
    .finally(() => docLoads.delete(docName));
  docLoads.set(docName, load);
  return load;
}

function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array) {
  if (conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message);
  } catch {
    closeConn(doc, conn);
  }
}

function sendPersistenceStatus(
  doc: WSSharedDoc,
  conn: WebSocket,
  status: "saved" | "error"
) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messagePersistence);
  encoding.writeVarString(encoder, status);
  send(doc, conn, encoding.toUint8Array(encoder));
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  if (!doc.conns.has(conn)) return;

  const controlledIds = doc.conns.get(conn);
  doc.conns.delete(conn);
  doc.connectionUsers.delete(conn);
  if (controlledIds) {
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null
    );
  }

  if (doc.conns.size === 0) {
    const timeout = setTimeout(() => {
      if (doc.conns.size !== 0) return;

      doc.stopPersistence();
      void doc.flushPersistence().finally(() => {
        if (doc.conns.size !== 0 || activeDocs.get(doc.name) !== doc) return;
        doc.awareness.destroy();
        activeDocs.delete(doc.name);
        doc.destroy();
        docCleanupTimeouts.delete(doc.name);
        console.log(`[Collab] Document unloaded: ${doc.name}`);
      });
    }, DOC_CLEANUP_DELAY);
    docCleanupTimeouts.set(doc.name, timeout);
  }

  if (
    conn.readyState === WebSocket.OPEN ||
    conn.readyState === WebSocket.CONNECTING
  ) {
    conn.close();
  }
}

const httpServer = http.createServer((_req, res) => {
  res.writeHead(persistenceStatus === "postgres" ? 200 : 503, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(
    JSON.stringify({
      status: persistenceStatus === "postgres" ? "ok" : "degraded",
      server: "Nexus Collaboration",
      documents: activeDocs.size,
      persistence: persistenceStatus,
      persistenceError,
    })
  );
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
  verifyClient: (info, callback) => {
    if (parseAuthorizedRequest(info.req.url, info.req.headers.host)) {
      callback(true);
    } else {
      // Never log the query string: it contains the short-lived bearer token.
      const pathname = (() => {
        try {
          return new URL(
            info.req.url || "/",
            `http://${info.req.headers.host || "localhost"}`
          ).pathname;
        } catch {
          return "/invalid-request";
        }
      })();
      console.warn("[Collab] Rejected unauthorized connection:", pathname);
      callback(false, 401, "Unauthorized");
    }
  },
});

wss.on("connection", (conn, req) => {
  const authorization = parseAuthorizedRequest(req.url, req.headers.host);
  if (!authorization) {
    conn.close(1008, "Unauthorized");
    return;
  }

  void getYDoc(authorization.docName)
    .then((doc) => {
      doc.conns.set(conn, new Set());
      doc.connectionUsers.set(conn, authorization.payload.u);
      console.log(`[Collab] Client connected to: ${authorization.docName}`);

      conn.on("message", (message: Buffer) => {
        try {
          const encoder = encoding.createEncoder();
          const decoder = decoding.createDecoder(new Uint8Array(message));
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync:
              encoding.writeVarUint(encoder, messageSync);
              syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
              if (encoding.length(encoder) > 1) {
                send(doc, conn, encoding.toUint8Array(encoder));
              }
              break;
            case messageAwareness:
              awarenessProtocol.applyAwarenessUpdate(
                doc.awareness,
                decoding.readVarUint8Array(decoder),
                conn
              );
              break;
            default:
              console.error("[Collab] Unknown message type:", messageType);
          }
        } catch (error) {
          console.error("[Collab] Error handling message:", error);
        }
      });

      conn.on("close", () => {
        closeConn(doc, conn);
        console.log(
          `[Collab] Client disconnected from: ${authorization.docName}`
        );
      });

      // Hydration is asynchronous, so the client's first sync message may have
      // arrived before the handlers above were attached. Initiate a fresh sync
      // after the room is ready to remove that connection race.
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, messageSync);
      syncProtocol.writeSyncStep1(syncEncoder, doc);
      send(doc, conn, encoding.toUint8Array(syncEncoder));

      const stateEncoder = encoding.createEncoder();
      encoding.writeVarUint(stateEncoder, messageSync);
      syncProtocol.writeSyncStep2(stateEncoder, doc);
      send(doc, conn, encoding.toUint8Array(stateEncoder));
    })
    .catch((error) => {
      markPersistenceError(error);
      conn.close(1011, "Collaboration persistence unavailable");
    });
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `[Collab] Listening on ws://${HOST}:${PORT} with Postgres persistence`
  );
  void db
    .execute(sql`SELECT 1`)
    .then(markPersistenceHealthy)
    .catch(markPersistenceError);
});

async function shutdown() {
  console.log("[Collab] Shutting down...");
  activeDocs.forEach((doc) => doc.stopPersistence());
  await Promise.all(Array.from(activeDocs.values(), (doc) => doc.flushPersistence()));
  wss.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
