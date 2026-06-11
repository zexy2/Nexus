/**
 * Shared AI provider quota-error helpers.
 *
 * Detects upstream provider rate-limit/quota failures (e.g. Gemini free tier)
 * so routes can translate them into a retryable 429 instead of a generic 500.
 */

export function isAiQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("quota") ||
    message.includes("Quota") ||
    message.includes("429")
  );
}

export function aiQuotaResponse(): Response {
  return Response.json(
    {
      error: "AI_PROVIDER_RATE_LIMITED",
      message: "Gemini free-tier quota was reached. Please wait a minute and try again.",
      retryable: true,
    },
    { status: 429 }
  );
}
