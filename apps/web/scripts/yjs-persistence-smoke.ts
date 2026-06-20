import * as Y from "yjs";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as decoding from "lib0/decoding";
import { eq } from "drizzle-orm";
import {
  docs,
  documentYjsSnapshots,
  documentYjsUpdates,
  getDb,
  users,
  workspaces,
} from "@nexus/database";
import { signCollabToken } from "../src/lib/collab-token";

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.COLLAB_AUTH_SECRET;
const collaborationUrl =
  process.env.COLLABORATION_SMOKE_URL || "ws://localhost:1234";

if (!databaseUrl || !authSecret) {
  throw new Error("DATABASE_URL and COLLAB_AUTH_SECRET are required");
}

const db = getDb(databaseUrl);
const collaborationAuthSecret = authSecret;

function waitForSync(provider: WebsocketProvider) {
  return new Promise<void>((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const timeout = setTimeout(
      () => reject(new Error("Collaboration sync timed out")),
      5000
    );
    const onProviderEvent = provider.on.bind(provider) as (
      event: string,
      callback: (value: boolean) => void
    ) => void;
    onProviderEvent("synced", (synced: boolean) => {
      if (!synced) return;
      clearTimeout(timeout);
      resolve();
    });
    provider.connect();
  });
}

function createProvider(docId: string, userId: string, ydoc: Y.Doc) {
  const token = signCollabToken(
    { d: docId, u: userId },
    collaborationAuthSecret
  );
  const provider = new WebsocketProvider(collaborationUrl, docId, ydoc, {
    params: { token },
    WebSocketPolyfill: WebSocket as never,
    connect: false,
  });
  provider.messageHandlers[4] = (_encoder, decoder) => {
    decoding.readVarString(decoder);
  };
  return provider;
}

async function getSeedIdentity() {
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .limit(1);
  if (!user || !workspace) {
    throw new Error("A seeded user and workspace are required");
  }
  return { userId: user.id, workspaceId: workspace.id };
}

async function writeConcurrentUpdates() {
  const { userId, workspaceId } = await getSeedIdentity();
  const [created] = await db
    .insert(docs)
    .values({
      workspaceId,
      title: "Yjs persistence smoke",
      content: [],
      createdBy: userId,
    })
    .returning({ id: docs.id });

  const firstDoc = new Y.Doc();
  const secondDoc = new Y.Doc();
  const firstProvider = createProvider(created.id, userId, firstDoc);
  const secondProvider = createProvider(created.id, userId, secondDoc);

  try {
    await Promise.all([
      waitForSync(firstProvider),
      waitForSync(secondProvider),
    ]);
    firstDoc.getText("smoke").insert(0, "A");
    secondDoc.getText("smoke").insert(0, "B");
    await new Promise((resolve) => setTimeout(resolve, 3200));

    const firstValue = firstDoc.getText("smoke").toString();
    const secondValue = secondDoc.getText("smoke").toString();
    if (firstValue !== secondValue || firstValue.length !== 2) {
      throw new Error(
        `Clients did not converge: "${firstValue}" vs "${secondValue}"`
      );
    }

    const [snapshot] = await db
      .select({ lastSequence: documentYjsSnapshots.lastSequence })
      .from(documentYjsSnapshots)
      .where(eq(documentYjsSnapshots.docId, created.id))
      .limit(1);
    const remainingUpdates = await db
      .select({ id: documentYjsUpdates.id })
      .from(documentYjsUpdates)
      .where(eq(documentYjsUpdates.docId, created.id));

    if (!snapshot) {
      throw new Error("Snapshot was not persisted");
    }

    console.log(
      JSON.stringify({
        phase: "write",
        docId: created.id,
        value: firstValue,
        snapshotSequence: snapshot.lastSequence,
        remainingUpdates: remainingUpdates.length,
      })
    );
  } finally {
    firstProvider.destroy();
    secondProvider.destroy();
    firstDoc.destroy();
    secondDoc.destroy();
  }
}

async function verifyRestore(docId: string) {
  const { userId } = await getSeedIdentity();
  const restoredDoc = new Y.Doc();
  const provider = createProvider(docId, userId, restoredDoc);

  try {
    await waitForSync(provider);
    const restoredValue = restoredDoc.getText("smoke").toString();
    if (restoredValue.length !== 2) {
      throw new Error(
        `Restored document has unexpected value: "${restoredValue}"`
      );
    }
    console.log(
      JSON.stringify({ phase: "restore", docId, value: restoredValue })
    );
  } finally {
    provider.destroy();
    restoredDoc.destroy();
    await db.delete(docs).where(eq(docs.id, docId));
  }
}

async function main() {
  const [mode = "write", docId] = process.argv.slice(2);
  if (mode === "write") {
    await writeConcurrentUpdates();
  } else if (mode === "restore" && docId) {
    await verifyRestore(docId);
  } else {
    throw new Error("Usage: pnpm smoke:collab [write | restore <docId>]");
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
