import { NextRequest, NextResponse } from "next/server";
import { createResearchAgent, searchTavily } from "@nexus/agents";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";

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

  try {
    const body = await request.json();
    const { query, useWebSearch = false, useDocSearch = false } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const agent = createResearchAgent();
    const result = await agent.execute(query, { useWebSearch, useDocSearch });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Research failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      output: result.output,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[Research API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    // Direct Tavily search
    const results = await searchTavily(query, { maxResults: 5 });

    return NextResponse.json({
      success: true,
      query: results.query,
      answer: results.answer,
      results: results.results,
    });
  } catch (error) {
    console.error("[Research API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
