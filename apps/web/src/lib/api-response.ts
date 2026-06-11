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

export const notFound = (message = "Resource not found") =>
  apiError(404, "Not Found", message);

export const serverError = (message = "Internal server error") =>
  apiError(500, "Internal Server Error", message);
