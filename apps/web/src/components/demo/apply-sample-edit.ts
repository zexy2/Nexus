import type { BlockNoteEditor } from "@blocknote/core";
import {
  DEMO_EDIT_BLOCK_ID,
  DEMO_EDIT_REQUIREMENT_KEY,
  demoSampleEditInline,
  planContentText,
} from "@/lib/demo-scenario-content";

type AnyEditor = BlockNoteEditor<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type AnyBlock = AnyEditor["document"][number];

function findRequirementBlock(blocks: AnyBlock[]): AnyBlock | undefined {
  for (const block of blocks) {
    if (planContentText(block.content).startsWith(DEMO_EDIT_REQUIREMENT_KEY)) return block;
    const nested = findRequirementBlock((block.children || []) as AnyBlock[]);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Replaces REQ-003 with the tour's suggested text through the live editor,
 * so the change flows through Yjs and the normal materialize-save path like
 * a typed edit. Falls back to appending the requirement if the visitor
 * already deleted it.
 */
export function applyDemoSampleEdit(editor: AnyEditor): boolean {
  try {
    const content = demoSampleEditInline();
    const target = editor.getBlock(DEMO_EDIT_BLOCK_ID) ?? findRequirementBlock(editor.document);
    if (target) {
      editor.updateBlock(target, { content } as Parameters<AnyEditor["updateBlock"]>[1]);
      return true;
    }
    const last = editor.document[editor.document.length - 1];
    if (!last) return false;
    editor.insertBlocks(
      [{ type: "bulletListItem", content }] as Parameters<AnyEditor["insertBlocks"]>[0],
      last,
      "after"
    );
    return true;
  } catch (error) {
    console.error("Failed to apply the demo sample edit:", error);
    return false;
  }
}
