/**
 * Turns API error payloads into copy a person can act on. Routes return
 * machine codes (`AGENT_JOB_CREATE_FAILED`, `CHANGE_SET_NOT_PENDING`, ...) in
 * `error`; those must never reach a toast verbatim.
 *
 * Known codes map to `feedback.errors.<CODE>` in messages.ts. Unknown codes
 * fall back to the route's human `message` (when it is a sentence) and then to
 * the caller's fallback copy.
 */

const KNOWN_CODES = [
  "AGENT_JOB_CREATE_FAILED",
  "ACTIVE_AGENT_JOB_EXISTS",
  "REPOSITORY_NOT_CONFIGURED",
  "DEMO_AGENT_HANDOFF_READ_ONLY",
  "DEMO_AGENT_SETTINGS_READ_ONLY",
  "DEMO_INTEGRATION_DISABLED",
  "DEMO_TOKEN_DISABLED",
  "AGENT_REVIEW_REQUIRED",
  "AGENT_CONTEXT_OUTDATED",
  "JOB_NOT_OUTDATED",
  "JOB_NOT_SUBMITTED",
  "JOB_CANNOT_BE_CANCELLED",
  "CHANGE_SET_NOT_PENDING",
  "CHANGE_SET_ALREADY_RESOLVED",
  "CHANGE_SET_NOT_FOUND",
  "CHANGE_REVIEW_PENDING",
  "NO_PROPOSALS_SELECTED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_RATE_LIMITED",
  "RATE_LIMIT_EXCEEDED",
  "TEMPORAL_UNAVAILABLE",
  "WORKFLOW_START_FAILED",
  "PROVIDER_API_FAILED",
  "INTEGRATION_NEEDS_CONFIG",
  "INTEGRATION_NOT_FOUND",
  "INVALID_REPOSITORY",
  "DOC_NOT_ARCHIVED",
  "WORKSPACE_OWNER_REQUIRED",
] as const;

export type KnownErrorCode = (typeof KNOWN_CODES)[number];

const KNOWN = new Set<string>(KNOWN_CODES);

const MACHINE_CODE = /^[A-Z][A-Z0-9_]+$/;

export function isKnownErrorCode(code: unknown): code is KnownErrorCode {
  return typeof code === "string" && KNOWN.has(code);
}

/** True when `value` reads like a sentence rather than a code or a stack. */
function isHumanMessage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text.length > 300) return false;
  if (MACHINE_CODE.test(text)) return false;
  return /\s/.test(text);
}

export function friendlyError(
  body: unknown,
  t: (path: string) => string,
  fallback: string
): string {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = record.error;
  if (isKnownErrorCode(code)) return t(`feedback.errors.${code}`);
  if (isHumanMessage(record.message)) return record.message.trim();
  if (isHumanMessage(code)) return code.trim();
  return fallback;
}

/** Thrown by `readJsonOrThrow` so callers can show the mapped message. */
export class FriendlyError extends Error {}

/**
 * Parses a fetch response; throws a `FriendlyError` with mapped copy when the
 * response is not ok.
 */
export async function readJsonOrThrow<T = unknown>(
  response: Response,
  t: (path: string) => string,
  fallback: string
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new FriendlyError(friendlyError(body, t, fallback));
  return body as T;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof FriendlyError && error.message ? error.message : fallback;
}
