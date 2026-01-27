/**
 * Gemini Chat Model for LangGraph
 * 
 * Gemini-compatible chat model using LangChain's standard interface.
 * Uses Google's Gemini 2.5 Flash for fast inference.
 */

import { BaseChatModel, type BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatResult, ChatGeneration } from "@langchain/core/outputs";

interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiChatModelParams extends BaseChatModelParams {
  modelName?: string;
  geminiApiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ChatGemini extends BaseChatModel {
  modelName: string;
  geminiApiKey: string;
  temperature: number;
  maxTokens: number;

  constructor(params: GeminiChatModelParams = {}) {
    super(params);
    this.modelName = params.modelName || "gemini-2.5-flash";
    this.geminiApiKey = params.geminiApiKey || process.env.GEMINI_API_KEY || "";
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.maxTokens ?? 4096;
  }

  _llmType(): string {
    return "gemini";
  }

  private convertToGeminiMessages(messages: BaseMessage[]): { systemInstruction?: string; contents: GeminiMessage[] } {
    let systemInstruction: string | undefined;
    const contents: GeminiMessage[] = [];

    for (const msg of messages) {
      if (msg instanceof SystemMessage || msg._getType?.() === "system") {
        systemInstruction = String(msg.content);
      } else if (msg instanceof HumanMessage || msg._getType?.() === "human") {
        contents.push({ role: "user", parts: [{ text: String(msg.content) }] });
      } else {
        contents.push({ role: "model", parts: [{ text: String(msg.content) }] });
      }
    }

    return { systemInstruction, contents };
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"]
  ): Promise<ChatResult> {
    const { systemInstruction, contents } = this.convertToGeminiMessages(messages);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
          contents,
          generationConfig: {
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const generation: ChatGeneration = {
      text: content,
      message: new AIMessage(content),
    };

    return {
      generations: [generation],
      llmOutput: {
        tokenUsage: data.usageMetadata,
        model: this.modelName,
      },
    };
  }
}
