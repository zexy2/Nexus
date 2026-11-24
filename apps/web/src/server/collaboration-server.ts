/**
 * Collaboration server core (transport + room state), independent of the
 * concrete storage backend so it can be exercised in tests with an in-memory
 * persistence adapter. `collaboration.ts` is the production entry point that
 * wires this up to Postgres.
 *
 * Wire protocol is the standard y-websocket protocol plus one Nexus-specific
 * message type (4) that reports persistence status ("saved" | "error") to the
 * connection whose update was (or could not be) persisted.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { type CollabTokenPayload, verifyCollabToken } from "../lib/collab-token";

export const messageSync = 0;
export const messageAwareness = 1;
export const messagePersistence = 4;

export interface LoadedCollabDocument {
  workspaceId: string;
  snapshot: Uint8Array | null;
  updates: Uint8Array[];
}

export interface CollabPersistence {
  /** Returns null when the document does not exist. */
  loadDocument(docId: string): Promise<LoadedCollabDocument | null>;
  appendUpdate(input: {
    docId: string;
    workspaceId: string;
    update: Uint8Array;
    actorUserId: string | null;
  }): Promise<void>;
  /**
   * Persist the full document state and compact the update log. Must succeed
   * even when the update log is empty (used to recover updates whose append
   * failed: they live only in memory until a snapshot captures them).
   */
  writeSnapshot(input: {
    docId: string;
    workspaceId: string;
    state: Uint8Array;
    stateVector: Uint8Array;
    updateCount: number;
  }): Promise<void>;
  healthCheck?(): Promise<void>;
}

type Logger = Pick<Console, "log" | "warn" | "error">;

export interface CollaborationServerOptions {
  authSecret: string;
  persistence: CollabPersistence;
  snapshotUpdateThreshold?: number;
  snapshotIntervalMs?: number;
  maxPayloadBytes?: number;
  docCleanupDelayMs?: number;
  /** Delays between in-line retries of a single failed persistence task. */
  persistenceRetryDelaysMs?: number[];
  /** Backoff schedule for background recovery snapshots after a hard failure. */
  recoveryDelaysMs?: number[];
  logger?: Logger;
}

const HYDRATE_ORIGIN = Symbol("persistence-hydration");

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

export function createCollaborationServer(options: CollaborationServerOptions) {
  const {
    authSecret,
    persistence,
    snapshotUpdateThreshold = 100,
    snapshotIntervalMs = 30_000,
    maxPayloadBytes = 1024 * 1024,
    docCleanupDelayMs = 5 * 60 * 1000,
    persistenceRetryDelaysMs = [250, 1000],
    recoveryDelaysMs = [2000, 5000, 15_000, 30_000],
    logger = console,
  } = options;

  const activeDocs = new Map<string, WSSharedDoc>();
  const docLoads = new Map<string, Promise<WSSharedDoc>>();
  const docCleanupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  let persistenceStatus: "postgres" | "unavailable" = "postgres";
  let persistenceError: string | null = null;

  function markPersistenceError(error: unknown) {
    persistenceStatus = "unavailable";
    persistenceError =
      error instanceof Error ? error.message : "Unknown persistence error";
    logger.error("[Collab] Persistence error:", error);
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

      const payload = verifyCollabToken(token, authSecret);
      if (!payload || payload.d !== docName) return null;

      return { docName, payload };
    } catch {
      return null;
    }
  }

  class WSSharedDoc extends Y.Doc {
    readonly name: string;
    readonly workspaceId: string;
    readonly awareness: awarenessProtocol.Awareness;
    /** Connection -> awareness client ids that connection controls. */
    readonly conns = new Map<WebSocket, Set<number>>();
    readonly connectionUsers = new Map<WebSocket, string | null>();

    private persistenceReady = false;
    private persistenceQueue: Promise<void> = Promise.resolve();
    private updatesSinceSnapshot = 0;
    private snapshotTimer: ReturnType<typeof setInterval> | null = null;

    /** True while some update is only held in memory after a failed write. */
    recoveryPending = false;
    private readonly awaitingRecovery = new Set<WebSocket>();
    private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    private recoveryAttempt = 0;
    private stopped = false;

    constructor(name: string, workspaceId: string) {
      super({ gc: true });
      this.name = name;
      this.workspaceId = workspaceId;
      this.awareness = new awarenessProtocol.Awareness(this);
      // The server has no presence of its own.
      this.awareness.setLocalState(null);

      this.awareness.on(
        "update",
        (
          {
            added,
            updated,
            removed,
          }: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown
        ) => {
          // Record which awareness client ids each socket controls so they can
          // be removed the moment the socket closes (instead of lingering
          // until the 30s awareness timeout).
          if (origin instanceof WebSocket) {
            const controlled = this.conns.get(origin);
            if (controlled) {
              added.forEach((clientId) => controlled.add(clientId));
              removed.forEach((clientId) => controlled.delete(clientId));
            }
          }

          const changedClients = added.concat(updated).concat(removed);
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageAwareness);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
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
        const conn = origin instanceof WebSocket ? origin : null;
        const actorUserId = conn ? this.connectionUsers.get(conn) ?? null : null;
        this.queueUpdate(update, actorUserId, conn);
      });
    }

    enablePersistence(updateCount: number) {
      this.persistenceReady = true;
      this.updatesSinceSnapshot = updateCount;
      this.snapshotTimer = setInterval(() => {
        if (this.updatesSinceSnapshot > 0 && !this.recoveryPending) {
          this.enqueue(async () => this.writeSnapshot());
        }
      }, snapshotIntervalMs);
      this.snapshotTimer.unref?.();
    }

    private async runWithRetry(task: () => Promise<void>) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= persistenceRetryDelaysMs.length; attempt++) {
        if (attempt > 0) await wait(persistenceRetryDelaysMs[attempt - 1]);
        try {
          await task();
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }

    private enqueue(task: () => Promise<void>, ackConnection?: WebSocket | null) {
      this.persistenceQueue = this.persistenceQueue
        .then(() => this.runWithRetry(task))
        .then(() => {
          if (this.recoveryPending) {
            // The database is reachable again but an earlier update exists only
            // in memory; acknowledge once the recovery snapshot has captured it.
            if (ackConnection) this.awaitingRecovery.add(ackConnection);
            this.scheduleRecovery(0);
            return;
          }
          markPersistenceHealthy();
          if (ackConnection) sendPersistenceStatus(this, ackConnection, "saved");
        })
        .catch((error) => {
          markPersistenceError(error);
          // The update is still applied to the in-memory doc; a full-state
          // snapshot will persist it once the database is reachable again.
          this.updatesSinceSnapshot += 1;
          this.recoveryPending = true;
          if (ackConnection) {
            this.awaitingRecovery.add(ackConnection);
            sendPersistenceStatus(this, ackConnection, "error");
          }
          this.scheduleRecovery();
        });
      return this.persistenceQueue;
    }

    /** Register a (re)connecting client while a recovery is pending. */
    notifyRecoveryPending(conn: WebSocket) {
      this.awaitingRecovery.add(conn);
      sendPersistenceStatus(this, conn, "error");
    }

    private scheduleRecovery(delayOverride?: number) {
      if (this.stopped) return;
      if (this.recoveryTimer) {
        if (delayOverride !== 0) return;
        clearTimeout(this.recoveryTimer);
      }
      const delay =
        delayOverride ??
        recoveryDelaysMs[Math.min(this.recoveryAttempt, recoveryDelaysMs.length - 1)];
      this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = null;
        void this.attemptRecovery();
      }, delay);
      this.recoveryTimer.unref?.();
    }

    private attemptRecovery() {
      this.persistenceQueue = this.persistenceQueue.then(async () => {
        if (!this.recoveryPending) return;
        try {
          await this.writeSnapshot(true);
        } catch (error) {
          markPersistenceError(error);
          this.recoveryAttempt += 1;
          this.scheduleRecovery();
          return;
        }
        this.recoveryPending = false;
        this.recoveryAttempt = 0;
        markPersistenceHealthy();
        const waiting = Array.from(this.awaitingRecovery);
        this.awaitingRecovery.clear();
        for (const conn of waiting) {
          if (this.conns.has(conn)) sendPersistenceStatus(this, conn, "saved");
        }
        logger.log(`[Collab] Persistence recovered: ${this.name}`);
      });
      return this.persistenceQueue;
    }

    forgetConnection(conn: WebSocket) {
      this.awaitingRecovery.delete(conn);
    }

    private queueUpdate(
      update: Uint8Array,
      actorUserId: string | null,
      ackConnection: WebSocket | null
    ) {
      const persistedUpdate = new Uint8Array(update);
      this.enqueue(async () => {
        await persistence.appendUpdate({
          docId: this.name,
          workspaceId: this.workspaceId,
          actorUserId,
          update: persistedUpdate,
        });
      }, ackConnection).then(() => {
        // Counted after the append so a retried task is not double counted.
        if (!this.recoveryPending) {
          this.updatesSinceSnapshot += 1;
          if (this.updatesSinceSnapshot >= snapshotUpdateThreshold) {
            this.enqueue(async () => this.writeSnapshot());
          }
        }
      });
    }

    private async writeSnapshot(force = false) {
      if (!force && this.updatesSinceSnapshot === 0) return;
      const updateCount = this.updatesSinceSnapshot;
      await persistence.writeSnapshot({
        docId: this.name,
        workspaceId: this.workspaceId,
        state: Y.encodeStateAsUpdate(this),
        stateVector: Y.encodeStateVector(this),
        updateCount,
      });
      this.updatesSinceSnapshot = Math.max(0, this.updatesSinceSnapshot - updateCount);
      logger.log(`[Collab] Snapshot saved: ${this.name}`);
    }

    async flushPersistence() {
      if (this.recoveryPending) {
        await this.attemptRecovery();
      } else if (this.updatesSinceSnapshot > 0) {
        this.enqueue(async () => this.writeSnapshot());
      }
      await this.persistenceQueue;
    }

    stopPersistence() {
      this.stopped = true;
      if (this.snapshotTimer) {
        clearInterval(this.snapshotTimer);
        this.snapshotTimer = null;
      }
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
      }
    }

    applyHydration(update: Uint8Array) {
      Y.applyUpdate(this, update, HYDRATE_ORIGIN);
    }
  }

  async function hydrateDocument(docName: string): Promise<WSSharedDoc> {
    const loaded = await persistence.loadDocument(docName);
    if (!loaded) throw new Error(`Document not found: ${docName}`);

    const doc = new WSSharedDoc(docName, loaded.workspaceId);
    if (loaded.snapshot) doc.applyHydration(loaded.snapshot);
    for (const update of loaded.updates) doc.applyHydration(update);

    doc.enablePersistence(loaded.updates.length);
    markPersistenceHealthy();
    logger.log(
      `[Collab] Hydrated document: ${docName} (snapshot=${Boolean(loaded.snapshot)}, updates=${loaded.updates.length})`
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
    doc.forgetConnection(conn);
    if (controlledIds && controlledIds.size > 0) {
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
          logger.log(`[Collab] Document unloaded: ${doc.name}`);
        });
      }, docCleanupDelayMs);
      timeout.unref?.();
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
        // Public endpoint: never expose raw DB error text. The detail is
        // logged by markPersistenceError and available via getPersistenceStatus.
        persistence: persistenceStatus,
      })
    );
  });

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: maxPayloadBytes,
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
        logger.warn("[Collab] Rejected unauthorized connection:", pathname);
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

    // Buffer messages that arrive while the room is hydrating so the client's
    // initial awareness state is not lost (sync is re-initiated below anyway).
    const earlyMessages: Buffer[] = [];
    const bufferEarly = (message: Buffer) => earlyMessages.push(message);
    conn.on("message", bufferEarly);
    let closedEarly = false;
    const onEarlyClose = () => {
      closedEarly = true;
    };
    conn.on("close", onEarlyClose);

    void getYDoc(authorization.docName)
      .then((doc) => {
        conn.off("message", bufferEarly);
        conn.off("close", onEarlyClose);
        if (closedEarly) return;

        doc.conns.set(conn, new Set());
        doc.connectionUsers.set(conn, authorization.payload.u);
        logger.log(`[Collab] Client connected to: ${authorization.docName}`);

        const handleMessage = (message: Buffer) => {
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
                logger.error("[Collab] Unknown message type:", messageType);
            }
          } catch (error) {
            logger.error("[Collab] Error handling message:", error);
          }
        };
        conn.on("message", handleMessage);

        conn.on("close", () => {
          closeConn(doc, conn);
          logger.log(`[Collab] Client disconnected from: ${authorization.docName}`);
        });

        // Hydration is asynchronous, so the client's first sync message may
        // have arrived before the handlers above were attached. Initiate a fresh
        // sync after the room is ready to remove that connection race.
        const syncEncoder = encoding.createEncoder();
        encoding.writeVarUint(syncEncoder, messageSync);
        syncProtocol.writeSyncStep1(syncEncoder, doc);
        send(doc, conn, encoding.toUint8Array(syncEncoder));

        const stateEncoder = encoding.createEncoder();
        encoding.writeVarUint(stateEncoder, messageSync);
        syncProtocol.writeSyncStep2(stateEncoder, doc);
        send(doc, conn, encoding.toUint8Array(stateEncoder));

        const states = doc.awareness.getStates();
        if (states.size > 0) {
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, messageAwareness);
          encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(
              doc.awareness,
              Array.from(states.keys())
            )
          );
          send(doc, conn, encoding.toUint8Array(awarenessEncoder));
        }

        if (doc.recoveryPending) doc.notifyRecoveryPending(conn);

        // Replay non-sync messages (awareness) received during hydration.
        for (const message of earlyMessages) {
          if (message[0] === messageAwareness) handleMessage(message);
        }
      })
      .catch((error) => {
        markPersistenceError(error);
        conn.close(1011, "Collaboration persistence unavailable");
      });
  });

  return {
    httpServer,
    wss,
    activeDocs: activeDocs as ReadonlyMap<string, WSSharedDoc>,
    getPersistenceStatus: () => ({ status: persistenceStatus, error: persistenceError }),
    markPersistenceHealthy,
    markPersistenceError,
    listen(port: number, host?: string): Promise<AddressInfo> {
      return new Promise((resolve) => {
        httpServer.listen(port, host, () =>
          resolve(httpServer.address() as AddressInfo)
        );
      });
    },
    async shutdown() {
      activeDocs.forEach((doc) => doc.stopPersistence());
      docCleanupTimeouts.forEach((timeout) => clearTimeout(timeout));
      docCleanupTimeouts.clear();
      await Promise.all(
        Array.from(activeDocs.values(), (doc) => doc.flushPersistence())
      );
      wss.clients.forEach((client) => client.terminate());
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

export type CollaborationServer = ReturnType<typeof createCollaborationServer>;
