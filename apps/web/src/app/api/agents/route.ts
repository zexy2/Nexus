/**
 * Deprecated compatibility endpoint for older Nexus clients.
 *
 * The current UI uses /api/chat. This route keeps the former SSE/JSON wire
 * format without maintaining a second provider stack or hard-coded model list.
 */
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { CHAT_CAPABILITIES, type ChatCapability } from "@/lib/ai/chat-agents";
import { runAgent } from "@/lib/ai/agent";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { aiQuotaResponse, isAiQuotaError } from "@/lib/ai/quota";
import { searchWeb } from "@/lib/ai/tavily";
import { enforceAiBudget, writeAuditLog } from "@/lib/production-guardrails";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type CompatibilityMode = "auto" | ChatCapability;

interface CompatibilityRequest {
  message?: string;
  context?: { workspaceId?: string };
  mode?: CompatibilityMode;
}

interface AuthorizedRequest {
  userId: string;
  email?: string | null;
}

interface PreparedRequest extends AuthorizedRequest {
  message: string;
  mode: CompatibilityMode;
  workspaceId: string;
  modelConfig: Awaited<ReturnType<typeof getUserModelConfig>>;
}

async function authenticateRequest(): Promise<
  { ok: true; value: AuthorizedRequest } | { ok: false; response: Response }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    value: { userId: session.user.id, email: session.user.email },
  };
}

function normalizeMode(value: unknown): CompatibilityMode {
  return value === "research" ||
    value === "writer" ||
    value === "coder" ||
    value === "task"
    ? value
    : "auto";
}

async function prepareRequest(request: NextRequest): Promise<
  { ok: true; value: PreparedRequest } | { ok: false; response: Response }
> {
  const authorized = await authenticateRequest();
  if (!authorized.ok) return authorized;

  let body: CompatibilityRequest;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  const message = body.message?.trim();
  if (!message) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Message is required" }, { status: 400 }),
    };
  }

  const budget = await enforceAiBudget({
    userId: authorized.value.userId,
    email: authorized.value.email,
    kind: "chat",
  });
  if (!budget.ok) return { ok: false, response: budget.response };

  const access = await requireWorkspaceAccess(
    authorized.value.userId,
    body.context?.workspaceId
  );
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }

  try {
    const modelConfig = await getUserModelConfig(authorized.value.userId);
    return {
      ok: true,
      value: {
        ...authorized.value,
        message,
        mode: normalizeMode(body.mode),
        workspaceId: access.workspaceId,
        modelConfig,
      },
    };
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "AI_PROVIDER_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "No server-managed AI provider is configured",
          retryable: false,
        },
        { status: 503 }
      ),
    };
  }
}

async function buildCapabilityContext(input: PreparedRequest): Promise<string> {
  const contextParts: string[] = [];
  const workspaceContext = await getRAGContext(input.message, input.workspaceId);
  if (workspaceContext) {
    contextParts.push(`WORKSPACE CONTEXT:\n${workspaceContext}`);
  }

  if (input.mode === "research") {
    try {
      const result = await searchWeb(input.message, { maxResults: 5, includeAnswer: true });
      const sources = result.results
        .slice(0, 5)
        .map((item) => `- ${item.title}: ${item.url}`)
        .join("\n");
      contextParts.push(
        `WEB RESEARCH:\n${result.answer || ""}${sources ? `\n\nSources:\n${sources}` : ""}`
      );
    } catch {
      contextParts.push("WEB RESEARCH: Tavily is not configured or is temporarily unavailable.");
    }
  }

  return contextParts.join("\n\n---\n\n");
}

async function executeRequest(input: PreparedRequest) {
  const { model, modelName, provider } = input.modelConfig;
  let message: string;
  let toolsUsed: string[] = [];

  if (input.mode === "auto") {
    const result = await runAgent({
      model,
      messages: [{ role: "user", content: input.message }],
      context: { userId: input.userId, workspaceId: input.workspaceId },
      maxSteps: 6,
    });
    message = result.text;
    toolsUsed = result.toolsUsed;
  } else {
    const capability = CHAT_CAPABILITIES[input.mode];
    const context = await buildCapabilityContext(input);
    const result = await generateText({
      model,
      system: `${capability.systemPrompt}${context ? `\n\n---\n${context}` : ""}`,
      prompt: input.message,
    });
    message = result.text;
  }

  await writeAuditLog({
    userId: input.userId,
    workspaceId: input.workspaceId,
    event: "ai.compatibility_chat",
    metadata: { mode: input.mode, provider, modelName, toolsUsed },
  });

  return { message, toolsUsed, modelName };
}

export async function POST(request: NextRequest) {
  const prepared = await prepareRequest(request);
  if (!prepared.ok) return prepared.response;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "thinking",
            agent: "nexus",
            message: "Processing request...",
          })}\n\n`
        )
      );

      try {
        const result = await executeRequest(prepared.value);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "final",
              agent: "nexus",
              message: result.message,
              model: result.modelName,
              toolsUsed: result.toolsUsed,
            })}\n\n`
          )
        );
      } catch (error) {
        const quota = isAiQuotaError(error);
        if (!quota) console.error("Compatibility AI request failed", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: quota ? "AI_PROVIDER_RATE_LIMITED" : "AI_REQUEST_FAILED",
              message: quota
                ? "AI provider quota was reached. Please try again later."
                : "AI request failed. Please try again later.",
            })}\n\n`
          )
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      Deprecation: "true",
      Link: '</api/chat>; rel="successor-version"',
    },
  });
}

export async function PUT(request: NextRequest) {
  const prepared = await prepareRequest(request);
  if (!prepared.ok) return prepared.response;

  try {
    const result = await executeRequest(prepared.value);
    return NextResponse.json({
      message: result.message,
      agent: "nexus",
      mode: prepared.value.mode,
      model: result.modelName,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    if (isAiQuotaError(error)) return aiQuotaResponse();
    console.error("Compatibility AI request failed", error);
    return NextResponse.json(
      {
        error: "AI_REQUEST_FAILED",
        message: "AI request failed. Please try again later.",
      },
      { status: 502 }
    );
  }
}
