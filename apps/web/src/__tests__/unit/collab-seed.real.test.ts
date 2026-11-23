import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import { buildSeedUpdate, seedFragmentIfEmpty } from "@/lib/collab/seed";

const content: PartialBlock[] = [
  { type: "heading", content: "Roadmap" },
  { type: "paragraph", content: "First paragraph" },
  {
    type: "bulletListItem",
    content: "Item",
    children: [{ type: "paragraph", content: "Nested" }],
  },
];

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("collaborative document seeding", () => {
  const editor = BlockNoteEditor.create();

  it("concurrent first open seeds content once", () => {
    // Two clients (and the server) see an empty document at the same time.
    const server = new Y.Doc();
    const alice = new Y.Doc();
    const bob = new Y.Doc();

    expect(seedFragmentIfEmpty(alice, editor, content)).toBe(true);
    expect(seedFragmentIfEmpty(bob, editor, content)).toBe(true);

    sync(alice, server);
    sync(bob, server);
    sync(alice, server);

    for (const doc of [server, alice, bob]) {
      const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment("document"));
      expect(blocks.map((block) => block.type)).toEqual([
        "heading",
        "paragraph",
        "bulletListItem",
      ]);
      expect(blocks[2].children).toHaveLength(1);
    }
    expect(Y.encodeStateAsUpdate(alice)).toEqual(Y.encodeStateAsUpdate(bob));
  });

  it("keeps a local edit when a concurrent identical seed arrives later", () => {
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    seedFragmentIfEmpty(alice, editor, content);
    // Alice edits right after seeding: removes the first block.
    alice.getXmlFragment("document").get(0)!;
    const group = alice.getXmlFragment("document").get(0) as Y.XmlElement;
    group.delete(0, 1);

    seedFragmentIfEmpty(bob, editor, content);
    sync(alice, bob);

    for (const doc of [alice, bob]) {
      const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment("document"));
      expect(blocks.map((block) => block.type)).toEqual(["paragraph", "bulletListItem"]);
    }
  });

  it("does not seed a document that already has content", () => {
    const doc = new Y.Doc();
    seedFragmentIfEmpty(doc, editor, content);
    expect(seedFragmentIfEmpty(doc, editor, [{ type: "paragraph", content: "x" }])).toBe(false);
    expect(seedFragmentIfEmpty(new Y.Doc(), editor, [])).toBe(false);
  });

  it("produces different updates for different content", () => {
    const a = buildSeedUpdate(editor, content);
    const b = buildSeedUpdate(editor, [{ type: "paragraph", content: "Other" }]);
    expect(a).not.toEqual(b);
  });
});
