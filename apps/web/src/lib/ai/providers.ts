/**
 * AI provider configuration helpers — including a local-model (Ollama) path for
 * privacy-first self-hosting.
 *
 * When `AI_LOCAL_ONLY=true`, all AI runs through a local Ollama server and NO
 * document content leaves the host: the chat/agent/workflow LLM is local, web
 * search is disabled, and external embeddings are skipped (RAG falls back to
 * local keyword search). Set `OLLAMA_BASE_URL` to point at the Ollama server's
 * OpenAI-compatible endpoint (e.g. http://localhost:11434/v1).
 */

export interface OllamaConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  embeddingModel: string;
}

/** Returns the Ollama config when a local server is configured, else null. */
export function getOllamaConfig(): OllamaConfig | null {
  const baseURL = process.env.OLLAMA_BASE_URL;
  if (!baseURL) return null;
  return {
    baseURL,
    // Ollama ignores the key, but the OpenAI-compatible client requires a value.
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    model: process.env.OLLAMA_MODEL || "llama3.1",
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
  };
}

function truthyEnv(name: string): boolean {
  const value = (process.env[name] || "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

/**
 * Privacy mode: force every AI feature through the local Ollama server and keep
 * all data on the host. Requires OLLAMA_BASE_URL to be set.
 */
export function isLocalOnly(): boolean {
  return truthyEnv("AI_LOCAL_ONLY") && getOllamaConfig() !== null;
}

/** True if any chat/LLM provider (external or local) is configured. */
export function hasAnyLlmProvider(): boolean {
  return (
    isLocalOnly() ||
    getOllamaConfig() !== null ||
    !!process.env.GEMINI_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.GROQ_API_KEY
  );
}
