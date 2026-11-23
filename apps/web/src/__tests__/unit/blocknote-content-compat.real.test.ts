/**
 * Stored-content compatibility across BlockNote upgrades.
 *
 * `fixtures/blocknote-0.51-document.json` was generated ONCE with the
 * pre-upgrade stack (@blocknote/core 0.51.4, @tiptap/core 3.17.0, yjs 13.6.29)
 * and must never be regenerated. It holds:
 *  - `partialInput`: the PartialBlock shape the app writes (incl. AI output),
 *  - `storedDocument`: `editor.document` as persisted in `docs.content`,
 *  - `yjsUpdateBase64`: a seeded Yjs doc (lib/collab/seed path),
 *  - `liveYjsUpdateBase64`: the same doc after edits made through a live
 *    collaborative editor (y-prosemirror sync plugin),
 *  - the blocks the old version read back from each.
 * The current BlockNote must load all of it without loss or mutation.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BlockNoteEditor, type Block, type PartialBlock } from "@blocknote/core";
import {
  blocksToYXmlFragment,
  withCollaboration,
  yXmlFragmentToBlocks,
} from "@blocknote/core/yjs";
import fixture from "../fixtures/blocknote-0.51-document.json";

type AnyBlock = Block<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const stored = fixture.storedDocument as unknown as AnyBlock[];
const fromBase64 = (value: string) => new Uint8Array(Buffer.from(value, "base64"));

/**
 * Content is persisted as JSON (docs.content), so compare the persisted shape:
 * `undefined` fields disappear and `undefined` array slots become `null`,
 * exactly as they did when the fixture was written by the old version.
 */
const persisted = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function loadYDoc(base64: string) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, fromBase64(base64));
  return doc;
}

describe("BlockNote stored content compatibility (0.51 fixtures)", () => {
  const editor = BlockNoteEditor.create();

  it("loads the stored JSON document unchanged", () => {
    const loaded = BlockNoteEditor.create({
      initialContent: stored as PartialBlock[],
    });
    expect(persisted(loaded.document)).toEqual(stored);
  });

  it("normalizes the app's partial block input exactly like the old version", () => {
    const loaded = BlockNoteEditor.create({
      initialContent: fixture.partialInput as PartialBlock[],
    });
    const doc = loaded.document;
    // The last block has no id in the input, so a random one is generated.
    const withoutLastId = (blocks: AnyBlock[]) =>
      blocks.map((block, index) =>
        index === blocks.length - 1 ? { ...block, id: "<generated>" } : block
      );
    expect(withoutLastId(persisted(doc))).toEqual(withoutLastId(stored));
  });

  it("reads the seeded Yjs fragment without loss", () => {
    const doc = loadYDoc(fixture.yjsUpdateBase64);
    const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment("document"));
    expect(persisted(blocks)).toEqual(fixture.yjsBlocks);
    expect(persisted(blocks)).toEqual(stored);
  });

  it("reads a Yjs doc edited by the old live editor without loss", () => {
    const doc = loadYDoc(fixture.liveYjsUpdateBase64);
    const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment("document"));
    expect(persisted(blocks)).toEqual(fixture.liveYjsBlocks);
    expect(persisted(blocks)).toEqual(fixture.liveEditorDocument);
  });

  it("opening an old Yjs doc in the collaborative editor does not rewrite it", () => {
    const doc = loadYDoc(fixture.liveYjsUpdateBase64);
    const before = Y.encodeStateVector(doc);
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => updates.push(update));

    const collab = BlockNoteEditor.create(
      withCollaboration({
        collaboration: {
          fragment: doc.getXmlFragment("document"),
          user: { name: "compat", color: "#00ff00" },
        },
      })
    );
    const element = document.createElement("div");
    document.body.appendChild(element);
    collab.mount(element);
    try {
      expect(persisted(collab.document)).toEqual(fixture.liveEditorDocument);
      expect(updates).toHaveLength(0);
      expect(Y.encodeStateVector(doc)).toEqual(before);

      // And it can still edit the old document.
      collab.updateBlock("h1", { content: "Yeni başlık" });
      const after = yXmlFragmentToBlocks(editor, doc.getXmlFragment("document"));
      expect(after[0].content).toEqual([
        { type: "text", text: "Yeni başlık", styles: {} },
      ]);
      expect(persisted(after.slice(1))).toEqual(fixture.liveEditorDocument.slice(1));
    } finally {
      collab.unmount();
      element.remove();
    }
  });

  it("re-seeding stored content produces the same Yjs structure as before", () => {
    const a = new Y.Doc({ gc: false });
    a.clientID = 4242;
    blocksToYXmlFragment(editor, stored, a.getXmlFragment("document"));
    const old = loadYDoc(fixture.yjsUpdateBase64);
    expect(a.getXmlFragment("document").toJSON()).toEqual(
      old.getXmlFragment("document").toJSON()
    );
    expect(Y.encodeStateAsUpdate(a)).toEqual(fromBase64(fixture.yjsUpdateBase64));
  });
});
