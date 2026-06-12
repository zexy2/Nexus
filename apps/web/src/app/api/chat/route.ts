/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chat API Route — multi-agent orchestration.
 *
 * Auto mode runs an autonomous tool-calling agent (lib/ai/agent): the model
 * decides which tools to call and chains them. Direct mode runs a single named
 * persona (lib/ai/chat-agents). Model selection, RAG and persistence live in
 * their own lib/ai modules.
 */
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchWeb } from "@/lib/ai/tavily";
import { enforceAiBudget, writeAuditLog } from "@/lib/production-guardrails";
import { isAiQuotaError, aiQuotaResponse } from "@/lib/ai/quota";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { AGENTS, type AgentType } from "@/lib/ai/chat-agents";
import { createDocument } from "@/lib/ai/chat-actions";
import { runAgent } from "@/lib/ai/agent";
import { ensureDefaultWorkspace } from "@/lib/workspace-auth";

// Allow streaming responses up to 60 seconds for agent operations
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return Response.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }
  const userId = session.user.id;

  const aiBudget = await enforceAiBudget({
    userId,
    email: session.user.email,
    kind: "chat",
  });
  if (!aiBudget.ok) return aiBudget.response;

  // `messages` stays loosely typed: the AI SDK's ModelMessage union is stricter
  // than the wire format the existing clients send, and we validate the parts
  // we rely on below.
  let body: { messages?: any[]; agentMode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Bad Request", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { messages, agentMode } = body;
  const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : undefined;
  if (!lastMessage || typeof lastMessage.content !== "string" || !lastMessage.content.trim()) {
    return Response.json(
      { error: "Bad Request", message: "messages must be a non-empty array with string content" },
      { status: 400 }
    );
  }

  const chatMessages = messages as any[];
  const userMessage: string = lastMessage.content;
  const userMessageLower = userMessage.toLowerCase();

  let modelConfig: Awaited<ReturnType<typeof getUserModelConfig>>;
  try {
    modelConfig = await getUserModelConfig(userId);
  } catch (error) {
    return Response.json(
      {
        error: "AI_PROVIDER_UNAVAILABLE",
        message: error instanceof Error ? error.message : "No server-managed AI provider is configured",
        retryable: false,
      },
      { status: 503 }
    );
  }

  await writeAuditLog({
    userId,
    event: "ai.chat",
    metadata: {
      agentMode: agentMode || "auto",
      modelName: modelConfig.modelName,
      provider: modelConfig.provider,
    },
  });

  const { model, modelName, provider } = modelConfig;

  // ==========================================
  // EXPLICIT SAVE DETECTION
  // ==========================================
  const saveKeywords = ['kaydet', 'save it', 'save this', 'bunu kaydet', 'çalışmayı kaydet', 'calismayı kaydet'];
  const wantsSave = saveKeywords.some(k => userMessageLower.includes(k));

  if (wantsSave) {
    const conversationHistory = chatMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    let docJson = "";
    try {
      const result = await generateText({
        model,
        prompt: `Extract the content to save as a document from this conversation.

CONVERSATION:
${conversationHistory}

Create a JSON response with title and content. Content should include the main information from the assistant's responses.
Respond ONLY with JSON: {"title": "...", "content": "..."}`,
      });
      docJson = result.text;
    } catch (error) {
      if (isAiQuotaError(error)) return aiQuotaResponse();
      throw error;
    }

    try {
      const match = docJson.match(/\{[\s\S]*\}/);
      if (match) {
        const { title, content } = JSON.parse(match[0]);
        if (title && content) {
          const result = await createDocument(userId, title, content);
          if (result.success) {
            return new Response(`✅ **Document Saved!**\n\n📄 **${result.title}**\n\nYou can find it in the Documents section.`);
          }
        }
      }
    } catch (e) {
      console.error("Save error:", e);
    }

    return new Response("❌ Could not save the document. Please try again.");
  }

  // ==========================================
  // MULTI-AGENT ORCHESTRATION
  // ==========================================

  // If specific agent mode selected, use that agent directly
  if (agentMode && agentMode !== "auto" && AGENTS[agentMode as AgentType]) {
    const agent = AGENTS[agentMode as AgentType];

    const workspaceId = (await ensureDefaultWorkspace(userId)).id;
    const agentRagContext = await getRAGContext(userMessage, workspaceId);

    // Web search for research mode using Tavily
    let webContext = "";
    if (agentMode === "research") {
      try {
        const webResults = await searchWeb(userMessage, { maxResults: 5, includeAnswer: true });
        if (webResults.answer) {
          const sources = webResults.results
            .slice(0, 5)
            .map(r => `- [${r.title}](${r.url})`)
            .join("\n");
          webContext = `**Web Search Results (${new Date().toLocaleDateString()}):**\n${webResults.answer}\n\n**Sources:**\n${sources}`;
        }
      } catch (e) {
        console.error("Tavily error:", e);
      }
    }

    const contextParts: string[] = [];
    if (agentRagContext) {
      contextParts.push(`📚 WORKSPACE BAĞLAMI:\n${agentRagContext}`);
    }
    if (webContext) {
      contextParts.push(`🌐 GÜNCEL WEB BİLGİSİ:\n${webContext}`);
    }

    const enhancedSystem = agent.systemPrompt + (contextParts.length > 0
      ? `\n\n---\n${contextParts.join("\n\n---\n")}`
      : "");

    try {
      const { text } = await generateText({
        model,
        system: enhancedSystem,
        messages: chatMessages,
      });

      return new Response(text);
    } catch (error) {
      if (isAiQuotaError(error)) return aiQuotaResponse();
      throw error;
    }
  }

  // Auto mode: autonomous tool-calling agent. The model is given tools
  // (workspace search, web search, document/task creation) and decides which to
  // call, chains them across steps, and synthesizes the answer — no regex
  // orchestration. Tools are bound to this user's verified workspace.
  const workspaceId = (await ensureDefaultWorkspace(userId)).id;

  let agentResult: Awaited<ReturnType<typeof runAgent>>;
  try {
    agentResult = await runAgent({
      model,
      messages: chatMessages,
      context: { userId, workspaceId },
      maxSteps: 6,
    });
  } catch (error) {
    if (isAiQuotaError(error)) {
      await writeAuditLog({
        userId,
        workspaceId,
        event: "ai.provider_rate_limited",
        metadata: { provider, modelName },
      });
      return aiQuotaResponse();
    }
    throw error;
  }

  await writeAuditLog({
    userId,
    workspaceId,
    event: "ai.agent_run",
    metadata: {
      toolsUsed: agentResult.toolsUsed,
      steps: agentResult.steps,
      createdDocs: agentResult.createdDocs.length,
      createdTasks: agentResult.createdTasks.length,
    },
  });

  // The agent already performed any saves via its tools; surface what it did.
  let finalResponse = agentResult.text;
  if (agentResult.createdDocs.length > 0) {
    finalResponse +=
      `\n\n📄 **Kaydedilen dokümanlar:**\n` +
      agentResult.createdDocs.map((d) => `- ${d.title}`).join("\n");
  }
  if (agentResult.createdTasks.length > 0) {
    finalResponse +=
      `\n\n✅ **Oluşturulan görevler:**\n` +
      agentResult.createdTasks.map((t) => `- ${t.title}`).join("\n");
  }

  return new Response(finalResponse);
}
