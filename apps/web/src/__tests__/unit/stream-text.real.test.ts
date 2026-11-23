/**
 * UTF-8 decoding of streamed responses (chat): multi-byte characters split
 * across network chunks must not turn into U+FFFD.
 */
import { describe, it, expect } from "vitest";
import { createLineSplitter, readTextStream } from "@/lib/stream-text";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Split bytes at every given offset. */
function splitAt(bytes: Uint8Array, offsets: number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = 0;
  for (const offset of offsets) {
    out.push(bytes.slice(start, offset));
    start = offset;
  }
  out.push(bytes.slice(start));
  return out;
}

describe("readTextStream", () => {
  const text = "Çalışma planı güncellendi: öğrenci ışığı söndü 🚀";
  const bytes = new TextEncoder().encode(text);

  it("keeps Turkish characters intact when a chunk ends mid-character", async () => {
    // "Ç" is 2 bytes: split right between them, and through the emoji too.
    const chunks = splitAt(bytes, [1, 4, 9, bytes.length - 2]);
    const seen: string[] = [];
    const result = await readTextStream(streamOf(chunks), (_t, acc) => seen.push(acc));
    expect(result).toBe(text);
    expect(result).not.toContain("�");
    expect(seen.at(-1)).toBe(text);
    for (const partial of seen) expect(partial).not.toContain("�");
  });

  it("survives one-byte chunks", async () => {
    const chunks = Array.from(bytes, (b) => new Uint8Array([b]));
    expect(await readTextStream(streamOf(chunks), () => {})).toBe(text);
  });

  it("documents the bug: non-streaming decode garbles split characters", () => {
    const [a, b] = splitAt(new TextEncoder().encode("ğ"), [1]);
    const decoder = new TextDecoder();
    expect(decoder.decode(a) + decoder.decode(b)).toContain("�");
  });

  it("returns an empty string without a body", async () => {
    expect(await readTextStream(null, () => {})).toBe("");
  });
});

describe("createLineSplitter", () => {
  it("holds back an incomplete line until the next chunk", () => {
    const lines = createLineSplitter();
    expect(lines.push('data: {"a":')).toEqual([]);
    expect(lines.push('1}\ndata: {"b"')).toEqual(['data: {"a":1}']);
    expect(lines.push(":2}\n")).toEqual(['data: {"b":2}']);
    expect(lines.flush()).toEqual([]);
    lines.push("tail");
    expect(lines.flush()).toEqual(["tail"]);
  });
});
