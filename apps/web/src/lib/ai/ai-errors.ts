/**
 * Client-side handling of AI endpoint failures.
 *
 * AI routes answer quota hits with 429 and a structured body
 * (`RATE_LIMIT_EXCEEDED` + scope/limit/resetAt from enforceAiBudget, or
 * `AI_PROVIDER_RATE_LIMITED` when the upstream provider throttles). The UI must
 * never show those codes raw: this turns them into a localized sentence with
 * the reset time. Safe to import from client components (no server deps).
 */

/** An error whose message is already localized and safe to show as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export interface AiErrorInfo {
  status: number;
  code?: string;
  message?: string;
  scope?: string;
  limit?: number;
  /** Epoch ms. */
  resetAt?: number;
}

type Translate = (path: string) => string;

function toEpoch(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Builds the error info from an already-parsed JSON body. */
export function aiErrorFromBody(
  status: number,
  raw: unknown,
  headers?: Pick<Headers, "get"> | null
): AiErrorInfo {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const code = typeof body?.error === "string" ? body.error : typeof body?.code === "string" ? body.code : undefined;
  return {
    status,
    code,
    message: typeof body?.message === "string" ? body.message : undefined,
    scope: typeof body?.scope === "string" ? body.scope : undefined,
    limit: typeof body?.limit === "number" ? body.limit : undefined,
    resetAt: toEpoch(body?.resetAt) ?? toEpoch(headers?.get("X-RateLimit-Reset")),
  };
}

/** Reads the error body of a failed AI response (never throws). */
export async function readAiError(response: Response): Promise<AiErrorInfo> {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  return aiErrorFromBody(response.status, body, response.headers);
}

export function isAiQuotaError(info: AiErrorInfo): boolean {
  return info.status === 429 || info.code === "RATE_LIMIT_EXCEEDED" || info.code === "AI_PROVIDER_RATE_LIMITED";
}

/** "14:05" when the reset is today, otherwise "26 Nov 14:05". */
export function formatResetTime(resetAt: number, locale: string, now = Date.now()): string {
  const date = new Date(resetAt);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  const tag = locale === "tr" ? "tr-TR" : "en-US";
  return sameDay
    ? date.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/** Localized, user-facing sentence for a failed AI call. */
export function formatAiError(info: AiErrorInfo, t: Translate, locale: string, fallback: string): string {
  if (info.code === "AI_PROVIDER_RATE_LIMITED") return t("aiQuota.providerBusy");
  if (info.code === "AI_PROVIDER_UNAVAILABLE" || info.code === "TEMPORAL_UNAVAILABLE") {
    return info.code === "TEMPORAL_UNAVAILABLE" ? t("aiQuota.workflowsUnavailable") : t("aiQuota.unavailable");
  }
  if (isAiQuotaError(info)) {
    const time = info.resetAt ? formatResetTime(info.resetAt, locale) : t("aiQuota.soon");
    const scope = info.scope ?? "";
    if (scope === "user_minute" || scope === "global_minute") {
      return fill(t("aiQuota.minuteReached"), { time });
    }
    if (scope === "global") return fill(t("aiQuota.globalReached"), { time });
    const kindKey = ["chat", "workflow", "research"].includes(scope) ? scope : "user";
    return fill(t("aiQuota.dailyReached"), {
      limit: info.limit ?? "",
      kind: t(`aiQuota.kind.${kindKey}`),
      time,
    }).replace(/\s{2,}/g, " ");
  }
  return info.message || fallback;
}

/** Reads + formats in one go, for `if (!res.ok) throw new Error(await aiErrorMessage(...))`. */
export async function aiErrorMessage(
  response: Response,
  t: Translate,
  locale: string,
  fallback: string
): Promise<string> {
  return formatAiError(await readAiError(response), t, locale, fallback);
}

// ---------------------------------------------------------------------------
// Quota snapshot (GET /api/ai/quota)
// ---------------------------------------------------------------------------

export interface AiQuotaBucket {
  limit: number;
  used: number;
  remaining: number;
  resetAt: number | null;
}

export interface AiQuotaSnapshot {
  calls: AiQuotaBucket;
  chat: AiQuotaBucket;
  workflow: AiQuotaBucket;
}

export const AI_QUOTA_CHANGED_EVENT = "nexus:ai-quota-changed";

/** Ask every mounted quota badge to refetch (after an AI call or a 429). */
export function notifyAiQuotaChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_QUOTA_CHANGED_EVENT));
}

/**
 * Effective remaining for a kind: a chat or workflow call also spends the
 * shared per-user daily budget, so the smaller of the two applies.
 */
export function effectiveRemaining(snapshot: AiQuotaSnapshot, kind: "chat" | "workflow"): AiQuotaBucket {
  const own = snapshot[kind];
  const shared = snapshot.calls;
  if (shared.remaining < own.remaining) {
    return { ...shared, limit: own.limit, remaining: shared.remaining };
  }
  return own;
}
