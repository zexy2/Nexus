import { describe, it, expect } from "vitest";
import { messages } from "@/lib/i18n/messages";

function flatten(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

describe("i18n messages", () => {
  const tr = flatten(messages.tr).sort();
  const en = flatten(messages.en).sort();

  it("tr and en expose identical key sets", () => {
    expect(en.filter((k) => !tr.includes(k))).toEqual([]);
    expect(tr.filter((k) => !en.includes(k))).toEqual([]);
  });

  it("has no empty strings", () => {
    const empty = (locale: "tr" | "en") =>
      flatten(messages[locale]).filter((path) => {
        let cursor: unknown = messages[locale];
        for (const seg of path.split(".")) {
          cursor = (cursor as Record<string, unknown>)[seg];
        }
        return cursor === "";
      });
    expect(empty("tr")).toEqual([]);
    expect(empty("en")).toEqual([]);
  });
});
