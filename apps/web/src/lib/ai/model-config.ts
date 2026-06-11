/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-managed AI model selection.
 *
 * Resolves the model to use for a user from their settings, falling back
 * through the configured server providers. Provider credentials are
 * server-managed in v1 (BYOK is disabled). The `any` model type is required
 * because AI SDK model types vary between providers.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { db } from "@/lib/db";
import { userSettings } from "@nexus/database/schema";
import { eq } from "drizzle-orm";

export type ModelProvider = "gemini" | "openai" | "anthropic" | "groq";

export interface ModelConfig {
  model: any;
  modelName: string;
  provider: ModelProvider;
}

// Configure AI providers - Server defaults (fallback)
const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const serverOpenai = process.env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Get user's preferred model. Provider credentials are server-managed in v1.
export async function getUserModelConfig(userId: string): Promise<ModelConfig> {
  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    const defaultModel = settings?.defaultModel || "gemini-2.5-flash";

    // Determine provider from model name
    let provider: ModelProvider = "gemini";
    if (defaultModel.startsWith("gpt")) provider = "openai";
    else if (defaultModel.startsWith("claude")) provider = "anthropic";
    else if (defaultModel.startsWith("llama")) provider = "groq";

    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      const geminiModelMap: Record<string, string> = {
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.0-pro": "gemini-2.0-pro-exp",
      };
      const modelId = geminiModelMap[defaultModel] || "gemini-2.5-flash";
      return { model: gemini(modelId), modelName: defaultModel, provider };
    }

    if (provider === "openai" && serverOpenai) {
      return { model: serverOpenai(defaultModel), modelName: defaultModel, provider };
    }

    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const serverAnthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const anthropicModelMap: Record<string, string> = {
        "claude-3-opus": "claude-3-opus-20240229",
        "claude-3-sonnet": "claude-3-5-sonnet-20241022",
        "claude-3-haiku": "claude-3-haiku-20240307",
      };
      const modelId = anthropicModelMap[defaultModel] || "claude-3-5-sonnet-20241022";
      return { model: serverAnthropic(modelId), modelName: defaultModel, provider };
    }

    if (provider === "groq" && process.env.GROQ_API_KEY) {
      // Groq uses OpenAI-compatible API
      const serverGroq = createOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
      const groqModelMap: Record<string, string> = {
        "llama-3.3-70b": "llama-3.3-70b-versatile",
        "llama-3.1-8b": "llama-3.1-8b-instant",
      };
      const modelId = groqModelMap[defaultModel] || "llama-3.3-70b-versatile";
      return { model: serverGroq(modelId), modelName: defaultModel, provider };
    }

    // Preferred provider is not configured on this server: fall back.
    if (process.env.GEMINI_API_KEY) {
      return { model: gemini("gemini-2.5-flash"), modelName: "gemini-2.5-flash", provider: "gemini" };
    }
    if (serverOpenai) {
      return { model: serverOpenai("gpt-4o-mini"), modelName: "gpt-4o-mini", provider: "openai" };
    }

    throw new Error("No server-managed AI provider key is configured");
  } catch (error) {
    console.error("Error getting user model config:", error);
    if (process.env.GEMINI_API_KEY) {
      return { model: gemini("gemini-2.5-flash"), modelName: "gemini-2.5-flash", provider: "gemini" };
    }
    if (serverOpenai) {
      return { model: serverOpenai("gpt-4o-mini"), modelName: "gpt-4o-mini", provider: "openai" };
    }
    throw error;
  }
}
