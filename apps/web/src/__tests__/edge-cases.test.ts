/**
 * Edge Cases & Boundary Conditions Test Suite
 * 40 Test Cases for extreme scenarios
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==========================================
// SECTION 1: BOUNDARY VALUE TESTS (15 Test Cases)
// ==========================================

describe("1. Boundary Value Tests", () => {
  
  it("TC-EDGE-001: Empty string handling", () => {
    const processTitle = (title: string) => {
      if (title.length === 0) return "Untitled";
      return title;
    };
    
    expect(processTitle("")).toBe("Untitled");
  });

  it("TC-EDGE-002: Single character input", () => {
    const validateName = (name: string) => name.length >= 1;
    
    expect(validateName("A")).toBe(true);
    expect(validateName("")).toBe(false);
  });

  it("TC-EDGE-003: Maximum string length (255 chars)", () => {
    const maxLength = 255;
    const truncate = (str: string) => str.slice(0, maxLength);
    
    const longString = "A".repeat(300);
    expect(truncate(longString).length).toBe(255);
  });

  it("TC-EDGE-004: Zero value handling", () => {
    const divide = (a: number, b: number) => {
      if (b === 0) throw new Error("Division by zero");
      return a / b;
    };
    
    expect(() => divide(10, 0)).toThrow("Division by zero");
    expect(divide(0, 10)).toBe(0);
  });

  it("TC-EDGE-005: Negative index handling", () => {
    const getItem = (arr: string[], index: number) => {
      if (index < 0 || index >= arr.length) {
        throw new Error("Index out of bounds");
      }
      return arr[index];
    };
    
    expect(() => getItem(["a", "b"], -1)).toThrow("out of bounds");
    expect(() => getItem(["a", "b"], 5)).toThrow("out of bounds");
  });

  it("TC-EDGE-006: Empty array operations", () => {
    const getFirst = <T>(arr: T[]): T | undefined => arr[0];
    const getLast = <T>(arr: T[]): T | undefined => arr[arr.length - 1];
    
    expect(getFirst([])).toBeUndefined();
    expect(getLast([])).toBeUndefined();
  });

  it("TC-EDGE-007: Maximum integer value", () => {
    const safeAdd = (a: number, b: number) => {
      const result = a + b;
      if (!Number.isSafeInteger(result)) {
        throw new Error("Integer overflow");
      }
      return result;
    };
    
    expect(() => safeAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow("overflow");
  });

  it("TC-EDGE-008: Date boundary - epoch", () => {
    const epoch = new Date(0);
    expect(epoch.getTime()).toBe(0);
    expect(epoch.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("TC-EDGE-009: Date boundary - far future", () => {
    const farFuture = new Date("2100-12-31");
    expect(farFuture.getFullYear()).toBe(2100);
  });

  it("TC-EDGE-010: Page 1 and last page", () => {
    const totalItems = 95;
    const pageSize = 10;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    expect(totalPages).toBe(10);
    
    // Last page should have 5 items
    const lastPageItems = totalItems % pageSize || pageSize;
    expect(lastPageItems).toBe(5);
  });

  it("TC-EDGE-011: Exactly one item per page", () => {
    const pageSize = 10;
    const totalItems = 10;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    expect(totalPages).toBe(1);
  });

  it("TC-EDGE-012: Float precision edge cases", () => {
    const formatPrice = (price: number) => {
      return Math.round(price * 100) / 100;
    };
    
    // Famous 0.1 + 0.2 problem
    expect(formatPrice(0.1 + 0.2)).toBe(0.3);
  });

  it("TC-EDGE-013: Whitespace-only strings", () => {
    const isBlank = (str: string) => str.trim().length === 0;
    
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\t\n")).toBe(true);
    expect(isBlank(" a ")).toBe(false);
  });

  it("TC-EDGE-014: Unicode string handling", () => {
    const title = "文档标题 🚀 émoji";
    expect(title.length).toBeGreaterThan(10);
    expect(title).toContain("🚀");
  });

  it("TC-EDGE-015: Very long unicode string", () => {
    const longEmoji = "🔥".repeat(1000);
    expect(longEmoji.length).toBe(2000); // Each emoji is 2 chars
  });
});

// ==========================================
// SECTION 2: NULL/UNDEFINED HANDLING (10 Test Cases)
// ==========================================

describe("2. Null/Undefined Handling", () => {
  
  it("TC-EDGE-016: Null coalescing", () => {
    const getValue = (val: string | null | undefined) => val ?? "default";
    
    expect(getValue(null)).toBe("default");
    expect(getValue(undefined)).toBe("default");
    expect(getValue("")).toBe(""); // Empty string is not nullish
    expect(getValue("value")).toBe("value");
  });

  it("TC-EDGE-017: Optional chaining", () => {
    interface User {
      settings?: {
        theme?: string;
      };
    }
    
    const getTheme = (user: User) => user.settings?.theme ?? "light";
    
    expect(getTheme({})).toBe("light");
    expect(getTheme({ settings: {} })).toBe("light");
    expect(getTheme({ settings: { theme: "dark" } })).toBe("dark");
  });

  it("TC-EDGE-018: Array with null elements", () => {
    const items = [1, null, 2, undefined, 3];
    const filtered = items.filter((x): x is number => x !== null && x !== undefined);
    
    expect(filtered).toEqual([1, 2, 3]);
  });

  it("TC-EDGE-019: Object with null values", () => {
    const obj = { a: 1, b: null, c: undefined };
    const keys = Object.keys(obj);
    
    expect(keys).toEqual(["a", "b", "c"]);
  });

  it("TC-EDGE-020: JSON null handling", () => {
    const json = '{"value": null}';
    const parsed = JSON.parse(json);
    
    expect(parsed.value).toBeNull();
    expect(parsed.nonexistent).toBeUndefined();
  });

  it("TC-EDGE-021: Default parameter with null", () => {
    const greet = (name: string | null = "Guest") => {
      return `Hello, ${name ?? "Anonymous"}`;
    };
    
    expect(greet(null)).toBe("Hello, Anonymous");
    expect(greet()).toBe("Hello, Guest");
  });

  it("TC-EDGE-022: Array length of null-ish", () => {
    const safeLength = (arr: unknown[] | null | undefined) => arr?.length ?? 0;
    
    expect(safeLength(null)).toBe(0);
    expect(safeLength(undefined)).toBe(0);
    expect(safeLength([])).toBe(0);
    expect(safeLength([1, 2, 3])).toBe(3);
  });

  it("TC-EDGE-023: Map get returning undefined", () => {
    const map = new Map<string, number>();
    map.set("exists", 42);
    
    expect(map.get("exists")).toBe(42);
    expect(map.get("missing")).toBeUndefined();
  });

  it("TC-EDGE-024: Set has for undefined", () => {
    const set = new Set([1, 2, undefined]);
    
    expect(set.has(undefined)).toBe(true);
    expect(set.has(null as unknown as undefined)).toBe(false);
  });

  it("TC-EDGE-025: typeof null quirk", () => {
    // Famous JavaScript quirk
    expect(typeof null).toBe("object");
    expect(null === undefined).toBe(false);
    expect(null == undefined).toBe(true);
  });
});

// ==========================================
// SECTION 3: ASYNC EDGE CASES (10 Test Cases)
// ==========================================

describe("3. Async Edge Cases", () => {
  
  it("TC-EDGE-026: Promise rejection", async () => {
    const failingPromise = () => Promise.reject(new Error("Async error"));
    
    await expect(failingPromise()).rejects.toThrow("Async error");
  });

  it("TC-EDGE-027: Multiple concurrent promises", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.resolve(3),
    ];
    
    const results = await Promise.all(promises);
    expect(results).toEqual([1, 2, 3]);
  });

  it("TC-EDGE-028: Promise.all with one rejection", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.reject(new Error("Failed")),
      Promise.resolve(3),
    ];
    
    await expect(Promise.all(promises)).rejects.toThrow("Failed");
  });

  it("TC-EDGE-029: Promise.allSettled", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.reject(new Error("Failed")),
    ];
    
    const results = await Promise.allSettled(promises);
    
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toMatchObject({ status: "rejected" });
  });

  it("TC-EDGE-030: Race condition handling", async () => {
    const fast = new Promise(resolve => setTimeout(() => resolve("fast"), 10));
    const slow = new Promise(resolve => setTimeout(() => resolve("slow"), 100));
    
    const winner = await Promise.race([fast, slow]);
    expect(winner).toBe("fast");
  });

  it("TC-EDGE-031: Async error in callback", async () => {
    const asyncWithCallback = async (callback: () => Promise<void>) => {
      await callback();
    };
    
    await expect(
      asyncWithCallback(async () => {
        throw new Error("Callback error");
      })
    ).rejects.toThrow("Callback error");
  });

  it("TC-EDGE-032: Empty promise array", async () => {
    const results = await Promise.all([]);
    expect(results).toEqual([]);
  });

  it("TC-EDGE-033: Chained promise rejection", async () => {
    const chain = Promise.resolve()
      .then(() => { throw new Error("Chain error"); })
      .then(() => "never reached");
    
    await expect(chain).rejects.toThrow("Chain error");
  });

  it("TC-EDGE-034: Finally always runs", async () => {
    let finallyCalled = false;
    
    try {
      await Promise.reject(new Error("Test"));
    } catch {
      // Caught
    } finally {
      finallyCalled = true;
    }
    
    expect(finallyCalled).toBe(true);
  });

  it("TC-EDGE-035: Async iterator edge case", async () => {
    async function* emptyGenerator() {
      // yields nothing
    }
    
    const items: unknown[] = [];
    for await (const item of emptyGenerator()) {
      items.push(item);
    }
    
    expect(items).toEqual([]);
  });
});

// ==========================================
// SECTION 4: TYPE COERCION TRAPS (5 Test Cases)
// ==========================================

describe("4. Type Coercion Traps", () => {
  
  it("TC-EDGE-036: Truthy/falsy edge cases", () => {
    expect(Boolean(0)).toBe(false);
    expect(Boolean("")).toBe(false);
    expect(Boolean("0")).toBe(true); // String "0" is truthy!
    expect(Boolean([])).toBe(true); // Empty array is truthy!
    expect(Boolean({})).toBe(true); // Empty object is truthy!
  });

  it("TC-EDGE-037: Equality quirks", () => {
    expect([] == false).toBe(true);
    expect([] == ![]).toBe(true); // Yes, really
    expect("" == false).toBe(true);
    
    // Always use strict equality
    const arr: unknown[] = [];
    const bool = false;
    expect(arr === bool).toBe(false);
  });

  it("TC-EDGE-038: NaN comparisons", () => {
    expect(NaN === NaN).toBe(false);
    expect(Number.isNaN(NaN)).toBe(true);
    expect(isNaN("not a number")).toBe(true);
    expect(Number.isNaN("not a number")).toBe(false); // Better!
  });

  it("TC-EDGE-039: Array sort quirks", () => {
    const nums = [10, 2, 1, 20];
    
    // Default sort is lexicographic!
    const badSort = [...nums].sort();
    expect(badSort).toEqual([1, 10, 2, 20]);
    
    // Correct numeric sort
    const goodSort = [...nums].sort((a, b) => a - b);
    expect(goodSort).toEqual([1, 2, 10, 20]);
  });

  it("TC-EDGE-040: Object key coercion", () => {
    const obj: Record<string, string> = {};
    const key1 = { toString: () => "key" };
    const key2 = { toString: () => "key" };
    
    obj[key1 as unknown as string] = "value1";
    obj[key2 as unknown as string] = "value2";
    
    // Both objects coerce to same key!
    expect(Object.keys(obj).length).toBe(1);
    expect(obj["key"]).toBe("value2");
  });
});
