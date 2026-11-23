import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api-response";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { enforceAiBudget } from "@/lib/production-guardrails";
import { searchWeb } from "@/lib/ai/tavily";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { getUserModelConfig } from "@/lib/ai/model-config";
import { generateTextTraced } from "@/lib/ai/traced-generate";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";

/**
 * Research API - Quick search with tools
 * 
 * Protected: Requires authentication
 * Rate Limited: 10 requests per minute (Tavily API costs)
 * 
 * POST /api/research
 * Body: { query: string, useWebSearch?: boolean, useDocSearch?: boolean }
 */

export async function POST(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.research,
  });
  
  if (!protection.success) {
    return protection.response;
  }
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { query, useWebSearch = false, useDocSearch = true, workspaceId } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }
    if (useWebSearch && !process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          error: "TAVILY_NOT_CONFIGURED",
          message: "Web research is not configured on this server.",
          retryable: false,
        },
        { status: 503 }
      );
    }

    const access = await requireWorkspaceAccess(
      protection.user.id,
      typeof workspaceId === "string" ? workspaceId : undefined
    );
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Budget is consumed only after the request is valid and authorized.
    const aiBudget = await enforceAiBudget({
      userId: protection.user.id,
      email: protection.user.email,
      kind: "research",
    });
    if (!aiBudget.ok) return aiBudget.response;

    const [workspaceContext, webResult, modelConfig] = await Promise.all([
      useDocSearch ? getRAGContext(query, access.workspaceId) : Promise.resolve(""),
      useWebSearch
        ? searchWeb(query, { maxResults: 5, searchDepth: "advanced", includeAnswer: true })
        : Promise.resolve(null),
      getUserModelConfig(protection.user.id),
    ]);

    const sources = webResult?.results.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
    })) ?? [];
    const webContext = webResult
      ? [webResult.answer, ...webResult.results.map((result) => `${result.title}\n${result.content}\n${result.url}`)]
          .filter(Boolean)
          .join("\n\n")
      : "";
    const context = [
      workspaceContext && `WORKSPACE CONTEXT:\n${workspaceContext}`,
      webContext && `WEB SOURCES:\n${webContext}`,
    ].filter(Boolean).join("\n\n---\n\n");

    const result = await generateTextTraced({
      model: modelConfig.model,
      system: "You are a research assistant. Separate verified facts from inference, state uncertainty, and cite only the supplied web URLs. Never invent a source.",
      prompt: `Research question: ${query}\n\n${context || "No external or workspace sources were requested. Provide an analysis and explicitly state that no sources were used."}`,
    }, {
      name: "research",
      agentType: "research",
      userId: protection.user.id,
      workspaceId: access.workspaceId,
      modelName: modelConfig.modelName,
      provider: modelConfig.provider,
      input: query,
    });

    return NextResponse.json({
      success: true,
      output: result.text,
      metadata: {
        sources,
        toolsCalled: [
          ...(workspaceContext ? ["workspace_search"] : []),
          ...(webResult ? ["web_search"] : []),
        ],
        provider: modelConfig.provider,
        model: modelConfig.modelName,
      },
    });
  } catch (error) {
    return internalError("Research API", error, { headers: request.headers });
  }
}

/**
 * Quick web search endpoint
 * 
 * Protected: Requires authentication
 * Rate Limited: 10 requests per minute
 * 
 * GET /api/research?q=query
 */
export async function GET(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.research,
  });
  
  if (!protection.success) {
    return protection.response;
  }
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }
    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          error: "TAVILY_NOT_CONFIGURED",
          message: "Web research is not configured on this server.",
          retryable: false,
        },
        { status: 503 }
      );
    }

    // Direct Tavily search
    const results = await searchWeb(query, { maxResults: 5 });

    return NextResponse.json({
      success: true,
      query: results.query,
      answer: results.answer,
      results: results.results,
    });
  } catch (error) {
    return internalError("Research API", error, { headers: request.headers });
  }
}
