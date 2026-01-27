/**
 * Groq Chat Model for LangGraph
 * 
 * Groq-compatible chat model using LangChain's standard interface.
 * Uses Groq's fast inference for llama models.
 */

import { BaseChatModel, type BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatResult, ChatGeneration } from "@langchain/core/outputs";

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqChatModelParams extends BaseChatModelParams {
  modelName?: string;
  groqApiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ChatGroq extends BaseChatModel {
  modelName: string;
  groqApiKey: string;
  temperature: number;
  maxTokens: number;

  constructor(params: GroqChatModelParams = {}) {
    super(params);
    this.modelName = params.modelName || "llama-3.3-70b-versatile";
    this.groqApiKey = params.groqApiKey || process.env.GROQ_API_KEY || "";
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.maxTokens ?? 4096;
  }

  _llmType(): string {
    return "groq";
  }

  private convertToGroqMessages(messages: BaseMessage[]): GroqMessage[] {
    return messages.map((msg) => {
      if (msg instanceof SystemMessage || msg._getType?.() === "system") {
        return { role: "system" as const, content: String(msg.content) };
      } else if (msg instanceof HumanMessage || msg._getType?.() === "human") {
        return { role: "user" as const, content: String(msg.content) };
      } else {
        return { role: "assistant" as const, content: String(msg.content) };
      }
    });
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"]
  ): Promise<ChatResult> {
    const groqMessages = this.convertToGroqMessages(messages);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: groqMessages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = data.choices[0]?.message?.content || "";

    const generation: ChatGeneration = {
      text: content,
      message: new AIMessage(content),
    };

    return {
      generations: [generation],
      llmOutput: {
        tokenUsage: data.usage,
        model: this.modelName,
      },
    };
  }
}
