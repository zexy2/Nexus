/**
 * Real unit tests for the AI provider / local-only (privacy) helpers
 * (lib/ai/providers). These gate the privacy mode: when AI_LOCAL_ONLY is on AND
 * a local Ollama server is configured, AI must run locally.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOllamaConfig, isLocalOnly, hasAnyLlmProvider } from "@/lib/ai/providers";

const AI_KEYS = [
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "OLLAMA_EMBEDDING_MODEL",
  "OLLAMA_API_KEY",
  "AI_LOCAL_ONLY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of AI_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of AI_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getOllamaConfig", () => {
  it("returns null when OLLAMA_BASE_URL is unset", () => {
    expect(getOllamaConfig()).toBeNull();
  });

  it("returns config with sensible defaults when the base URL is set", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    expect(getOllamaConfig()).toEqual({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
      model: "llama3.1",
      embeddingModel: "nomic-embed-text",
    });
  });

  it("honours overrides", () => {
    process.env.OLLAMA_BASE_URL = "http://host:1/v1";
    process.env.OLLAMA_MODEL = "qwen2.5";
    process.env.OLLAMA_EMBEDDING_MODEL = "mxbai-embed-large";
    process.env.OLLAMA_API_KEY = "secret";
    expect(getOllamaConfig()).toMatchObject({ model: "qwen2.5", embeddingModel: "mxbai-embed-large", apiKey: "secret" });
  });
});

describe("isLocalOnly", () => {
  it("is false without AI_LOCAL_ONLY", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    expect(isLocalOnly()).toBe(false);
  });

  it("is false when AI_LOCAL_ONLY is set but no Ollama server is configured", () => {
    process.env.AI_LOCAL_ONLY = "true";
    expect(isLocalOnly()).toBe(false);
  });

  it("is true only with both the flag and a configured server", () => {
    process.env.AI_LOCAL_ONLY = "true";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    expect(isLocalOnly()).toBe(true);
  });

  it("accepts common truthy values", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    for (const v of ["1", "yes", "on", "TRUE"]) {
      process.env.AI_LOCAL_ONLY = v;
      expect(isLocalOnly()).toBe(true);
    }
  });
});

describe("hasAnyLlmProvider", () => {
  it("is false with nothing configured", () => {
    expect(hasAnyLlmProvider()).toBe(false);
  });

  it("is true with an external key", () => {
    process.env.GEMINI_API_KEY = "g";
    expect(hasAnyLlmProvider()).toBe(true);
  });

  it("is true with only a local Ollama server (privacy mode needs no external key)", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    expect(hasAnyLlmProvider()).toBe(true);
  });
});
