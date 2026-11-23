/**
 * Standard API error envelope.
 *
 * Every error response carries `{ error, message }` (+ optional `code` and
 * extras) so clients can rely on one shape. New and refactored routes should
 * use these helpers instead of hand-rolling Response.json bodies.
 */
import { NextResponse } from "next/server";

interface ApiErrorExtras {
  code?: string;
  [key: string]: unknown;
}

export function apiError(
  status: number,
  error: string,
  message: string,
  extras?: ApiErrorExtras
): NextResponse {
  return NextResponse.json({ error, message, ...extras }, { status });
}

export const badRequest = (message: string, extras?: ApiErrorExtras) =>
  apiError(400, "Bad Request", message, extras);

export const unauthorized = (message = "Authentication required") =>
  apiError(401, "Unauthorized", message);

export const forbidden = (message = "Access denied") =>
  apiError(403, "Forbidden", message);

export const serverError = (message = "Internal server error") =>
  apiError(500, "Internal Server Error", message);

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Correlation id for an error response: reuses a well-formed inbound
 * `x-request-id` (set by the reverse proxy) or generates one.
 */
export function getRequestId(headers?: Headers | null): string {
  const inbound = headers?.get("x-request-id");
  return inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : crypto.randomUUID();
}

/** Log an unexpected error server-side; returns the request id to hand to the client. */
export function logInternalError(context: string, error: unknown, headers?: Headers | null): string {
  const requestId = getRequestId(headers);
  console.error(`[${context}] requestId=${requestId}`, error);
  return requestId;
}

/**
 * Log an unexpected error server-side and return a generic response that
 * carries only a request id. Internal error messages (SQL, provider, stack
 * details) must never reach the client.
 */
export function internalError(
  context: string,
  error: unknown,
  options: {
    status?: number;
    error?: string;
    message?: string;
    headers?: Headers | null;
    extras?: ApiErrorExtras;
  } = {}
): NextResponse {
  const requestId = logInternalError(context, error, options.headers);
  const response = apiError(
    options.status ?? 500,
    options.error ?? "Internal Server Error",
    options.message ?? "An unexpected error occurred. Please try again.",
    { ...options.extras, requestId }
  );
  response.headers.set("X-Request-Id", requestId);
  return response;
}

/** True for machine-readable error codes (e.g. ACTIVE_AGENT_JOB_EXISTS, invalid_state). */
export function isErrorCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(value);
}
