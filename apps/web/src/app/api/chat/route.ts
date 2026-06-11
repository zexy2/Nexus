/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chat API Route — multi-agent orchestration.
 *
 * Thin orchestration layer: model selection (lib/ai/model-config), RAG
 * (lib/ai/chat-rag), agent personas (lib/ai/chat-agents) and persistence
 * side-effects (lib/ai/chat-actions) live in their own modules. LangGraph is
 * loaded dynamically because its types are unavailable at build time.
 */
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchWeb } from "@/lib/ai/tavily";
import { enforceAiBudget, writeAuditLog } from "@/lib/production-guardrails";
import { isAiQuotaError, aiQuotaResponse } from "@/lib/ai/quota";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { AGENTS, SUPERVISOR_PROMPT, executeAgent, type AgentType } from "@/lib/ai/chat-agents";
import { applyAutoSave, createDocument } from "@/lib/ai/chat-actions";
import { ensureDefaultWorkspace } from "@/lib/workspace-auth";

// Allow streaming responses up to 60 seconds for agent operations
export const maxDuration = 60;

// LangGraph imports (dynamically loaded to avoid build issues)
let createSupervisor: any = null;
let HumanMessage: any = null;

async function initLangGraph() {
  if (createSupervisor) return true;
  try {
    const agents = await import("@nexus/agents");
    const messages = await import("@langchain/core/messages");
    createSupervisor = agents.createSupervisor;
    HumanMessage = messages.HumanMessage;
    return true;
  } catch (e) {
    console.warn("LangGraph not available, using fallback:", e);
    return false;
  }
}

// LangGraph-based multi-agent execution
async function executeWithLangGraph(
  userMessage: string,
  ragContext: string,
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; output: string; agentsUsed: string[] }> {
  try {
    const langGraphReady = await initLangGraph();
    if (!langGraphReady || !createSupervisor || !HumanMessage) {
      return { success: false, output: "LangGraph not available", agentsUsed: [] };
    }

    const supervisor = createSupervisor({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: process.env.GEMINI_API_KEY,
    });

    const initialState = {
      messages: [new HumanMessage(userMessage)],
      currentAgent: null,
      agentResults: {},
      plan: [],
      completed: [],
      context: {
        workspaceId,
        userId,
        sessionId: `session-${Date.now()}`,
        ragContext,
      },
      finalOutput: undefined,
    };

    const result = await supervisor.invoke(initialState);

    const agentsUsed = result.completed || [];
    const output = result.finalOutput ||
      Object.values(result.agentResults || {})
        .map((r: any) => r.output)
        .join("\n\n") ||
      "No response generated.";

    return { success: true, output, agentsUsed };
  } catch (error) {
    console.error("LangGraph error:", error);
    if (isAiQuotaError(error)) {
      throw error;
    }
    return {
      success: false,
      output: `Error with LangGraph: ${error}`,
      agentsUsed: [],
    };
  }
}

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

  // Auto mode: Use LangGraph Supervisor for multi-agent orchestration
  const workspaceId = (await ensureDefaultWorkspace(userId)).id;
  const ragContext = await getRAGContext(userMessage, workspaceId);

  const USE_LANGGRAPH = process.env.USE_LANGGRAPH !== "false"; // Default to true

  if (USE_LANGGRAPH) {
    let langGraphResult: Awaited<ReturnType<typeof executeWithLangGraph>>;
    try {
      langGraphResult = await executeWithLangGraph(
        userMessage + (ragContext ? `\n\nWorkspace Context:\n${ragContext}` : ""),
        ragContext,
        workspaceId,
        userId
      );
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

    if (langGraphResult.success) {
      const finalResponse = await applyAutoSave({
        userId,
        userMessage,
        agentsUsed: langGraphResult.agentsUsed,
        finalResponse: langGraphResult.output,
        separator: "\n\n",
      });
      return new Response(finalResponse);
    }
  }

  // Fallback: Manual supervisor logic if LangGraph fails or is disabled
  let planResponse = "";
  try {
    const result = await generateText({
      model,
      system: SUPERVISOR_PROMPT,
      prompt: userMessage,
    });
    planResponse = result.text;
  } catch (error) {
    if (isAiQuotaError(error)) return aiQuotaResponse();
    throw error;
  }

  // Extract agent plan from response
  let agentPlan: AgentType[] = [];
  const planMatch = planResponse.match(/\[([^\]]*)\]/);
  if (planMatch) {
    try {
      agentPlan = JSON.parse(`[${planMatch[1]}]`).filter(
        (a: string) => AGENTS[a as AgentType]
      );
    } catch {}
  }

  // If no agents needed, respond directly (simple queries)
  if (agentPlan.length === 0) {
    const systemWithRAG = `You are Nexus AI, a helpful, intelligent assistant. Be concise and informative.${ragContext ? `\n\nYou have access to the user's workspace context:${ragContext}` : ""}`;

    try {
      const { text } = await generateText({
        model,
        system: systemWithRAG,
        messages: chatMessages,
      });
      return new Response(text);
    } catch (error) {
      if (isAiQuotaError(error)) return aiQuotaResponse();
      throw error;
    }
  }

  // Execute agents in sequence with RAG context
  let context = ragContext;
  const agentOutputs: { agent: AgentType; output: string }[] = [];

  try {
    for (const agentType of agentPlan) {
      const result = await executeAgent(agentType, userMessage, context, model);
      agentOutputs.push({ agent: agentType, output: result.output });
      context += `\n\n[${AGENTS[agentType].name}]:\n${result.output}`;
    }
  } catch (error) {
    if (isAiQuotaError(error)) return aiQuotaResponse();
    throw error;
  }

  // Build final response - show agent output directly without heavy formatting
  let finalResponse = "";
  if (agentOutputs.length === 1) {
    finalResponse = agentOutputs[0].output;
  } else {
    for (const { agent, output } of agentOutputs) {
      const agentInfo = AGENTS[agent];
      finalResponse += `### ${agentInfo.emoji} ${agentInfo.name}\n\n${output}\n\n`;
    }
  }

  finalResponse = await applyAutoSave({
    userId,
    userMessage,
    agentsUsed: agentPlan,
    finalResponse,
    taskSource: agentOutputs.find(a => a.agent === "task")?.output || "",
    docSource: agentOutputs.find(a => a.agent === "writer")?.output || "",
    separator: "\n",
  });

  return new Response(finalResponse);
}
