/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ask Nexus API route.
 *
 * Auto mode runs an autonomous tool-calling agent (lib/ai/agent): the model
 * decides which tools to call and chains them. Legacy direct-mode values map to
 * focused capabilities, not separately running agent personas.
 */
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchWeb } from "@/lib/ai/tavily";
import { enforceAiBudget, writeAuditLog } from "@/lib/production-guardrails";
import { isAiQuotaError, aiQuotaResponse } from "@/lib/ai/quota";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { CHAT_CAPABILITIES, capabilitySystemPrompt, type ChatCapability } from "@/lib/ai/chat-agents";
import { resolveRequestLocale } from "@/lib/i18n/locale";
import { runAgent } from "@/lib/ai/agent";
import { generateTextTraced } from "@/lib/ai/traced-generate";
import { ensureDefaultWorkspace, getAccessibleWorkspaceIds } from "@/lib/workspace-auth";
import { logInternalError } from "@/lib/api-response";
import { AGENT_META_HEADER, encodeAgentMeta } from "@/lib/ai/agent-meta";

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

  // `messages` stays loosely typed: the AI SDK's ModelMessage union is stricter
  // than the wire format the existing clients send, and we validate the parts
  // we rely on below.
  let body: { messages?: any[]; agentMode?: string; locale?: string };
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

  // Budget is consumed only after the request body is validated.
  const aiBudget = await enforceAiBudget({
    userId,
    email: session.user.email,
    kind: "chat",
  });
  if (!aiBudget.ok) return aiBudget.response;

  const chatMessages = messages as any[];
  const userMessage: string = lastMessage.content;
  // UI locale (body -> x-nexus-locale header -> cookie); absent -> mirror the user.
  const locale = resolveRequestLocale(req, body.locale);

  let modelConfig: Awaited<ReturnType<typeof getUserModelConfig>>;
  try {
    modelConfig = await getUserModelConfig(userId);
  } catch (error) {
    const requestId = logInternalError("Chat model config", error, req.headers);
    return Response.json(
      {
        error: "AI_PROVIDER_UNAVAILABLE",
        message: "No server-managed AI provider is configured",
        retryable: false,
        requestId,
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

  // Saving to a document is the agent's createDocument tool (only when the
  // user asks) or the explicit "Save as plan" action on a reply. Messages
  // are never hijacked by keywords such as "save this".

  // ==========================================
  // FOCUSED CAPABILITY MODE (legacy wire value)
  // ==========================================

  // Older clients may still request a focused mode. It uses the same provider,
  // quota and workspace boundary as Ask Nexus.
  if (
    agentMode &&
    agentMode !== "auto" &&
    CHAT_CAPABILITIES[agentMode as ChatCapability]
  ) {

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
          webContext = `**Web Search Results (${new Date().toISOString().slice(0, 10)}):**\n${webResults.answer}\n\n**Sources:**\n${sources}`;
        }
      } catch (e) {
        console.error("Tavily error:", e);
      }
    }

    const contextParts: string[] = [];
    if (agentRagContext) {
      contextParts.push(`📚 WORKSPACE CONTEXT:\n${agentRagContext}`);
    }
    if (webContext) {
      contextParts.push(`🌐 CURRENT WEB INFORMATION:\n${webContext}`);
    }

    const enhancedSystem = capabilitySystemPrompt(agentMode as ChatCapability, locale) + (contextParts.length > 0
      ? `\n\n---\n${contextParts.join("\n\n---\n")}`
      : "");

    try {
      const { text } = await generateTextTraced(
        { model, instructions: enhancedSystem, messages: chatMessages },
        { name: `chat.${agentMode}`, agentType: "chat", userId, workspaceId, modelName, provider }
      );

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
  // Task questions read every workspace the Work board shows, not just the
  // default one.
  const readableWorkspaceIds = await getAccessibleWorkspaceIds(userId);

  let agentResult: Awaited<ReturnType<typeof runAgent>>;
  try {
    agentResult = await runAgent({
      model,
      messages: chatMessages,
      context: { userId, workspaceId, readableWorkspaceIds },
      maxSteps: 6,
      locale,
      trace: { name: "chat.agent", modelName, provider },
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

  // The agent already performed any saves via its tools. What it did (tools,
  // steps, created docs/tasks with ids) travels in a header so the chat can
  // render it as links next to the reply; the body stays the plain answer.
  return new Response(agentResult.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      [AGENT_META_HEADER]: encodeAgentMeta({
        toolsUsed: agentResult.toolsUsed,
        steps: agentResult.steps,
        createdDocs: agentResult.createdDocs,
        createdTasks: agentResult.createdTasks,
      }),
    },
  });
}
