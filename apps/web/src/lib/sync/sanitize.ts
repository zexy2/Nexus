/**
 * Input hygiene for client-written sync payloads (app/api/sync/push).
 *
 * PostgreSQL cannot store some strings JavaScript happily produces, and
 * rejects them with a data exception that used to surface as a 500. The sync
 * client treats 5xx as transient and retries, so one such mutation blocked the
 * whole offline queue. Here:
 * - U+0000 (NUL) is invalid in both `text` and `jsonb`: it is removed.
 * - Lone UTF-16 surrogates are invalid in `jsonb` ("\ud800"): they become
 *   U+FFFD, which is what a `text` column would have stored anyway.
 * Both rules apply to string values and object keys, at any depth. Identifier
 * fields are not rewritten (that would silently target a different row); the
 * route rejects ids containing NUL with 400 instead (see hasNul).
 */

type Row = Record<string, unknown>;

export const MAX_PAYLOAD_DEPTH = 64;

export class PayloadTooDeepError extends Error {
  constructor() {
    super(`Payload is nested more than ${MAX_PAYLOAD_DEPTH} levels deep`);
  }
}

const NUL = /\u0000/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function hasNul(value: unknown): boolean {
  return typeof value === "string" && value.includes("\u0000");
}

export function sanitizeText(value: string): string {
  return value.replace(NUL, "").replace(LONE_SURROGATE, "�");
}

/** Deep copy of `value` with every string (and object key) sanitized. */
export function sanitizePayload<T>(value: T, preserveKeys: ReadonlySet<string> = new Set(), depth = 0): T {
  if (depth > MAX_PAYLOAD_DEPTH) throw new PayloadTooDeepError();
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, undefined, depth + 1)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Row = {};
    for (const [key, item] of Object.entries(value as Row)) {
      // Top-level identifiers are validated by the caller, not rewritten.
      out[depth === 0 && preserveKeys.has(key) ? key : sanitizeText(key)] =
        depth === 0 && preserveKeys.has(key) ? item : sanitizePayload(item, undefined, depth + 1);
    }
    return out as T;
  }
  return value;
}

/**
 * PostgreSQL SQLSTATE of a database error, looking through wrappers
 * (drizzle's DrizzleQueryError keeps the driver error as `cause`).
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
