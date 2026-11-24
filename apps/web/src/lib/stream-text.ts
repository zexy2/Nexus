/**
 * Read a byte stream as UTF-8 text without garbling multi-byte characters.
 *
 * Network chunks can end in the middle of a character (Turkish ğ/ş/ı/ç/ö/ü
 * are two bytes in UTF-8). `decoder.decode(chunk)` without `{ stream: true }`
 * turns each half into U+FFFD. Streaming mode buffers the partial bytes until
 * the next chunk, and the final `decode()` flushes anything left.
 */
export async function readTextStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  onText: (text: string, accumulated: string) => void
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) {
      accumulated += text;
      onText(text, accumulated);
    }
  }
  const tail = decoder.decode();
  if (tail) {
    accumulated += tail;
    onText(tail, accumulated);
  }
  return accumulated;
}

/**
 * Split a streamed text into complete lines, keeping the unfinished last line
 * for the next chunk (SSE events can be split across chunks too).
 */
export function createLineSplitter() {
  let buffer = "";
  return {
    push(text: string): string[] {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
