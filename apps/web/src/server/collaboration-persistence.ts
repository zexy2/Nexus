/**
 * Postgres-backed persistence for the collaboration server: an append-only
 * update log (`document_yjs_updates`) periodically compacted into a snapshot
 * (`document_yjs_snapshots`). Storage format is unchanged from the original
 * server so existing document state stays readable.
 */

import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import {
  documentYjsSnapshots,
  documentYjsUpdates,
  docs as docsTable,
  type getDb,
} from "@nexus/database";
import type { CollabPersistence } from "./collaboration-server";

type Database = ReturnType<typeof getDb>;

function toUint8Array(value: Buffer | Uint8Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function extractMaterializedText(value: unknown): string {
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

export function createPostgresCollabPersistence(db: Database): CollabPersistence {
  return {
    async loadDocument(docId) {
      const [docRow] = await db
        .select({ workspaceId: docsTable.workspaceId })
        .from(docsTable)
        .where(eq(docsTable.id, docId))
        .limit(1);
      if (!docRow) return null;

      const [snapshot] = await db
        .select()
        .from(documentYjsSnapshots)
        .where(eq(documentYjsSnapshots.docId, docId))
        .limit(1);

      const lastSequence = snapshot?.lastSequence ?? 0;
      const updates = await db
        .select({ update: documentYjsUpdates.update })
        .from(documentYjsUpdates)
        .where(
          and(
            eq(documentYjsUpdates.docId, docId),
            gt(documentYjsUpdates.sequence, lastSequence)
          )
        )
        .orderBy(documentYjsUpdates.sequence);

      return {
        workspaceId: docRow.workspaceId,
        snapshot: snapshot ? toUint8Array(snapshot.state) : null,
        updates: updates.map((row) => toUint8Array(row.update)),
      };
    },

    async appendUpdate({ docId, workspaceId, update, actorUserId }) {
      await db.insert(documentYjsUpdates).values({
        docId,
        workspaceId,
        actorUserId,
        update: Buffer.from(update),
      });
    },

    async writeSnapshot({ docId, workspaceId, state, stateVector, updateCount }) {
      const [latestUpdate] = await db
        .select({ sequence: documentYjsUpdates.sequence })
        .from(documentYjsUpdates)
        .where(eq(documentYjsUpdates.docId, docId))
        .orderBy(desc(documentYjsUpdates.sequence))
        .limit(1);

      // With an empty log (e.g. recovering an update whose append failed) keep
      // the previous snapshot's sequence so hydration still replays later rows.
      let lastSequence = latestUpdate?.sequence;
      if (lastSequence === undefined) {
        const [existing] = await db
          .select({ lastSequence: documentYjsSnapshots.lastSequence })
          .from(documentYjsSnapshots)
          .where(eq(documentYjsSnapshots.docId, docId))
          .limit(1);
        lastSequence = existing?.lastSequence ?? 0;
      }

      const [materializedDoc] = await db
        .select({ content: docsTable.content })
        .from(docsTable)
        .where(eq(docsTable.id, docId))
        .limit(1);

      const materializedContent = materializedDoc?.content ?? null;
      const values = {
        state: Buffer.from(state),
        stateVector: Buffer.from(stateVector),
        updateCount,
        lastSequence,
        materializedContent,
        materializedText: extractMaterializedText(materializedContent),
        updatedAt: new Date(),
      };

      await db
        .insert(documentYjsSnapshots)
        .values({ docId, workspaceId, ...values })
        .onConflictDoUpdate({ target: documentYjsSnapshots.docId, set: values });

      if (latestUpdate) {
        await db
          .delete(documentYjsUpdates)
          .where(
            and(
              eq(documentYjsUpdates.docId, docId),
              lte(documentYjsUpdates.sequence, latestUpdate.sequence)
            )
          );
      }
    },

    async healthCheck() {
      await db.execute(sql`SELECT 1`);
    },
  };
}
