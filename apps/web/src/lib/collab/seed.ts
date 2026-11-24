/**
 * Deterministic seeding of a collaborative document from its materialized
 * BlockNote content.
 *
 * When several clients open a document with no Yjs state at the same time,
 * each of them sees an empty fragment and seeds it. If every client inserted
 * with its own random Yjs clientID the CRDT would keep all copies and the body
 * would appear twice. Instead the seed is built in a scratch Y.Doc whose
 * clientID is derived from a hash of the content, with deterministic block ids.
 * Every client therefore produces the *same* Yjs items (same ids), and Yjs
 * deduplicates them on merge: the content is inserted exactly once no matter
 * how many clients seed concurrently.
 */
import * as Y from "yjs";
import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { blocksToYXmlFragment } from "@blocknote/core/yjs";

const SEED_ORIGIN = Symbol("nexus-collab-seed");

type AnyEditor = BlockNoteEditor<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type SeedBlock = PartialBlock<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Fill in missing block ids with ids derived from the block's position. */
function normalizeSeedBlocks(blocks: SeedBlock[], path = "seed"): SeedBlock[] {
  return blocks.map((block, index) => {
    const id = typeof block.id === "string" && block.id ? block.id : `${path}-${index}`;
    const children = Array.isArray(block.children)
      ? normalizeSeedBlocks(block.children as SeedBlock[], `${id}`)
      : block.children;
    return { ...block, id, ...(children ? { children } : {}) };
  });
}

/** 32-bit FNV-1a hash mapped onto a valid, non-zero Yjs clientID. */
function seedClientId(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

/** Build the (deterministic) Yjs update that seeds `fragmentName`. */
export function buildSeedUpdate(
  editor: AnyEditor,
  blocks: SeedBlock[],
  fragmentName = "document"
): Uint8Array {
  const normalized = normalizeSeedBlocks(blocks);
  const scratch = new Y.Doc({ gc: false });
  scratch.clientID = seedClientId(`${fragmentName}:${JSON.stringify(normalized)}`);
  blocksToYXmlFragment(
    editor,
    normalized as Parameters<typeof blocksToYXmlFragment>[1],
    scratch.getXmlFragment(fragmentName)
  );
  const update = Y.encodeStateAsUpdate(scratch);
  scratch.destroy();
  return update;
}

/**
 * Seed `ydoc`'s fragment with `blocks` if it is still empty. Safe to call from
 * several clients concurrently. Returns true when a seed was applied.
 */
export function seedFragmentIfEmpty(
  ydoc: Y.Doc,
  editor: AnyEditor,
  blocks: SeedBlock[] | undefined,
  fragmentName = "document"
): boolean {
  if (!blocks || blocks.length === 0) return false;
  if (ydoc.getXmlFragment(fragmentName).length > 0) return false;
  Y.applyUpdate(ydoc, buildSeedUpdate(editor, blocks, fragmentName), SEED_ORIGIN);
  return true;
}
