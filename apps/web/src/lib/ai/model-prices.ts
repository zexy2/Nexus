/**
 * Per-model token prices for the admin AI usage view's ROUGH cost estimate.
 *
 * Prices are USD per 1M tokens. Nothing is priced by default on purpose:
 * provider prices change and differ by tier/region, so the app makes no claim
 * about them. To enable the estimate, set AI_MODEL_PRICES_JSON (preferred) or
 * fill DEFAULT_MODEL_PRICES below — and VERIFY the numbers against the
 * provider's current pricing page first.
 *
 *   AI_MODEL_PRICES_JSON='{"gemini-2.5-flash":{"input":0.3,"output":2.5}}'
 *
 * Keys match the `model` column of ai_traces (the model name the app resolved,
 * e.g. "gemini-2.5-flash", "gpt-4o-mini"). Local Ollama models cost 0.
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Fill only with prices you have verified (see module docs). */
const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {};

function isPrice(value: unknown): value is ModelPrice {
  if (!value || typeof value !== "object") return false;
  const { input, output } = value as Record<string, unknown>;
  return (
    typeof input === "number" && Number.isFinite(input) && input >= 0 &&
    typeof output === "number" && Number.isFinite(output) && output >= 0
  );
}

/** Configured prices: DEFAULT_MODEL_PRICES overridden by AI_MODEL_PRICES_JSON. */
export function getModelPrices(): Record<string, ModelPrice> {
  const prices: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICES };
  const raw = process.env.AI_MODEL_PRICES_JSON;
  if (!raw || !raw.trim()) return prices;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [model, price] of Object.entries(parsed ?? {})) {
      if (isPrice(price)) prices[model] = { input: price.input, output: price.output };
    }
  } catch {
    console.warn("[ai-usage] AI_MODEL_PRICES_JSON is not valid JSON; cost estimate disabled");
  }
  return prices;
}

/**
 * Rough USD cost for a token count, or null when the model has no configured
 * price (unknown cost, not zero).
 */
export function estimateCostUsd(
  prices: Record<string, ModelPrice>,
  provider: string | null,
  model: string | null,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (provider === "ollama") return 0;
  const price = model ? prices[model] : undefined;
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
