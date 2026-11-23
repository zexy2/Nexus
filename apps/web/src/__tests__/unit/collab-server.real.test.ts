// @vitest-environment node
/**
 * End-to-end tests for the collaboration server core with an in-memory
 * persistence adapter and real y-websocket clients over a real socket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WS from "ws";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import { WebsocketProvider } from "y-websocket";
import { signCollabToken } from "@/lib/collab-token";
import {
  type CollabPersistence,
  type CollaborationServer,
  createCollaborationServer,
} from "@/server/collaboration-server";
import { attachCollabTokenRefresh } from "@/lib/collab/token-refresh";
import {
  type CollabPersistenceStatus,
  getCollabEditorState,
  nextPersistenceStatus,
} from "@/lib/collab/editor-state";

const SECRET = "collab-test-secret";
const DOC_ID = "doc-1";
const silent = { log: () => {}, warn: () => {}, error: () => {} };

function memoryPersistence() {
  const state = {
    snapshot: null as Uint8Array | null,
    updates: [] as Uint8Array[],
    appendFailures: 0,
    appendCalls: 0,
    snapshotCalls: 0,
  };
  const persistence: CollabPersistence = {
    async loadDocument(docId) {
      if (docId !== DOC_ID) return null;
      return { workspaceId: "ws-1", snapshot: state.snapshot, updates: [...state.updates] };
    },
    async appendUpdate({ update }) {
      state.appendCalls += 1;
      if (state.appendFailures > 0) {
        state.appendFailures -= 1;
        throw new Error("transient database error");
      }
      state.updates.push(update);
    },
    async writeSnapshot({ state: docState }) {
      state.snapshotCalls += 1;
      state.snapshot = docState;
      state.updates = [];
    },
  };
  return { state, persistence };
}

let server: CollaborationServer;
let url: string;
let store: ReturnType<typeof memoryPersistence>;
const providers: WebsocketProvider[] = [];

function createProvider(params: Record<string, string>, connect = true) {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(url, DOC_ID, ydoc, {
    WebSocketPolyfill: WS as unknown as typeof WebSocket,
    connect,
    params,
    disableBc: true,
    maxBackoffTime: 200,
  });
  providers.push(provider);
  return { ydoc, provider };
}

function waitFor(predicate: () => boolean, timeoutMs = 4000) {
  return vi.waitFor(
    () => {
      if (!predicate()) throw new Error("condition not met");
    },
    { timeout: timeoutMs, interval: 20 }
  );
}

beforeEach(async () => {
  store = memoryPersistence();
  server = createCollaborationServer({
    authSecret: SECRET,
    persistence: store.persistence,
    persistenceRetryDelaysMs: [10, 10],
    recoveryDelaysMs: [50, 50],
    snapshotIntervalMs: 60_000,
    logger: silent,
  });
  const address = await server.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const provider of providers.splice(0)) {
    provider.destroy();
    provider.doc.destroy();
  }
  await server.shutdown();
});

describe("collaboration server", () => {
  it("reconnect after expiry succeeds", async () => {
    const fetchToken = vi
      .fn<() => Promise<string>>()
      // First token expires almost immediately, the refreshed one is long lived.
      .mockImplementationOnce(async () =>
        signCollabToken({ d: DOC_ID, u: "user-1", e: Date.now() + 600 }, SECRET)
      )
      .mockImplementation(async () =>
        signCollabToken({ d: DOC_ID, u: "user-1" }, SECRET)
      );

    const { provider } = createProvider({}, false);
    const refresh = attachCollabTokenRefresh(provider, {
      fetchToken,
      refreshMarginMs: 100,
    });
    await refresh.start();
    await waitFor(() => provider.wsconnected && provider.synced);
    const expiredToken = provider.params.token;

    // Let the token expire, then drop the connection (sleep / network loss).
    await new Promise((resolve) => setTimeout(resolve, 700));
    server.wss.clients.forEach((client) => client.terminate());

    await waitFor(() => fetchToken.mock.calls.length >= 2);
    await waitFor(() => provider.wsconnected && provider.synced);
    expect(provider.params.token).not.toBe(expiredToken);

    // The expired token on its own is refused by the server.
    const { provider: stale } = createProvider({ token: expiredToken });
    let rejected = false;
    stale.on("connection-close", () => {
      rejected = true;
    });
    await waitFor(() => rejected);
    expect(stale.wsconnected).toBe(false);
    refresh.dispose();
  });

  it("closed connection removes presence", async () => {
    const token = signCollabToken({ d: DOC_ID, u: "user-a" }, SECRET);
    const a = createProvider({ token });
    const b = createProvider({ token: signCollabToken({ d: DOC_ID, u: "user-b" }, SECRET) });
    a.provider.awareness.setLocalStateField("user", { name: "A" });
    b.provider.awareness.setLocalStateField("user", { name: "B" });

    const aClientId = a.ydoc.clientID;
    await waitFor(() => b.provider.awareness.getStates().has(aClientId));

    // Simulate a crashed tab: the socket dies without an awareness goodbye.
    a.provider.shouldConnect = false;
    (a.provider.ws as unknown as WS).terminate();

    // Well under the 30s awareness timeout.
    await waitFor(() => !b.provider.awareness.getStates().has(aClientId), 2000);
  });

  it("editor recovers after transient save error", async () => {
    // Every in-line attempt for the first update fails, then the DB recovers.
    store.state.appendFailures = 3;
    const { ydoc, provider } = createProvider({
      token: signCollabToken({ d: DOC_ID, u: "user-1" }, SECRET),
    });

    let status: CollabPersistenceStatus = "saved";
    const history: CollabPersistenceStatus[] = [];
    provider.messageHandlers[4] = (_encoder, decoder) => {
      const value = decoding.readVarString(decoder);
      status = nextPersistenceStatus(status, value === "saved" ? "ack-saved" : "ack-error");
      history.push(status);
    };
    const canEdit = () =>
      getCollabEditorState({
        editable: true,
        isConnected: provider.wsconnected,
        isSynced: provider.synced,
        connectionError: false,
        persistenceStatus: status,
        localReady: false,
        hasLocalContent: false,
      }).canEdit;

    await waitFor(() => provider.synced);
    expect(canEdit()).toBe(true);

    ydoc.getText("t").insert(0, "hello");

    await waitFor(() => history.includes("error"));
    expect(history[0]).toBe("error");
    await waitFor(() => status === "saved");
    expect(history).toEqual(["error", "saved"]);
    expect(canEdit()).toBe(true);

    // The update whose append failed was persisted by the recovery snapshot.
    const restored = new Y.Doc();
    Y.applyUpdate(restored, store.state.snapshot!);
    expect(restored.getText("t").toString()).toBe("hello");
    expect(server.getPersistenceStatus().status).toBe("postgres");

    // Later edits are acknowledged normally again.
    ydoc.getText("t").insert(5, "!");
    await waitFor(() => history.length === 3);
    expect(history[2]).toBe("saved");
  });
});
