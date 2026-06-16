import { NextRequest, NextResponse } from "next/server";
import { and, inArray, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { enforceAiBudget } from "@/lib/production-guardrails";
import {
  buildWorkspaceSearchContext,
  createHighlight,
  searchWorkspaceContent,
  type WorkspaceSearchResult,
} from "@/lib/workspace-search";
import {
  isEmbeddingsAvailable,
  semanticSearch,
} from "@/lib/ai/embeddings";
import {
  ensureDefaultWorkspace,
  getAccessibleWorkspaceIds,
  requireWorkspaceAccess,
} from "@/lib/workspace-auth";
import { docs } from "@nexus/database/schema";

async function resolveWorkspace(userId: string, workspaceId?: string | null) {
  if (workspaceId) {
    const access = await requireWorkspaceAccess(userId, workspaceId);
    if (!access.ok) return access;
    return { ok: true as const, workspaceId: access.workspaceId };
  }

  const accessible = await getAccessibleWorkspaceIds(userId);
  if (accessible[0]) {
    return { ok: true as const, workspaceId: accessible[0] };
  }

  const workspace = await ensureDefaultWorkspace(userId);
  return { ok: true as const, workspaceId: workspace.id };
}

async function runSemanticSearch(
  query: string,
  workspaceId: string,
  limit: number
): Promise<WorkspaceSearchResult[]> {
  const hits = await semanticSearch(query, workspaceId, {
    limit,
    minSimilarity: 0.2,
  });

  const docIds = Array.from(
    new Set(hits.map((hit) => hit.docId).filter((id): id is string => Boolean(id)))
  );
  if (docIds.length === 0) return [];

  const rows = await db
    .select({ id: docs.id, title: docs.title, updatedAt: docs.updatedAt })
    .from(docs)
    .where(and(inArray(docs.id, docIds), eq(docs.workspaceId, workspaceId)));

  const docById = new Map(rows.map((row) => [row.id, row]));

  return hits
    .filter((hit): hit is typeof hit & { docId: string } => Boolean(hit.docId))
    .map((hit) => {
      const doc = docById.get(hit.docId);
      return {
        id: hit.docId,
        title: doc?.title || "Document",
        content: hit.content,
        type: "document" as const,
        score: hit.similarity,
        highlight: createHighlight(hit.content, query),
        updatedAt: (doc?.updatedAt || new Date()).toISOString(),
      };
    });
}

export async function GET(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.default,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type") || undefined;
  const workspaceId = searchParams.get("workspaceId");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 10), 1), 25);

  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const workspace = await resolveWorkspace(protection.user.id, workspaceId);
  if (!workspace.ok) {
    return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  }

  const results = await searchWorkspaceContent(query, workspace.workspaceId, { type, limit });

  return NextResponse.json({
    query,
    workspaceId: workspace.workspaceId,
    results,
    total: results.length,
    searchType: "keyword",
  });
}

export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.default,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { query, options = {} } = body as {
    query?: unknown;
    options?: {
      type?: string;
      limit?: number;
      includeContext?: boolean;
      useSemantic?: boolean;
      workspaceId?: string;
    };
  };

  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const limit = Math.min(Math.max(Number(options.limit || 5), 1), 25);
  const workspace = await resolveWorkspace(protection.user.id, options.workspaceId);
  if (!workspace.ok) {
    return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  }

  const results: WorkspaceSearchResult[] = [];
  let semanticAttempted = false;

  if (options.useSemantic !== false && isEmbeddingsAvailable()) {
    const aiBudget = await enforceAiBudget({
      userId: protection.user.id,
      email: protection.user.email,
      kind: "embedding",
    });
    if (!aiBudget.ok) return aiBudget.response;

    semanticAttempted = true;
    try {
      results.push(...await runSemanticSearch(query, workspace.workspaceId, limit));
    } catch (error) {
      console.error("Semantic search failed, falling back to keyword:", error);
    }
  }

  const keywordResults = await searchWorkspaceContent(query, workspace.workspaceId, {
    type: options.type,
    limit,
  });
  for (const result of keywordResults) {
    if (!results.some((existing) => existing.id === result.id && existing.type === result.type)) {
      results.push({
        ...result,
        score: semanticAttempted ? result.score * 0.8 : result.score,
      });
    }
  }

  const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
  const context = options.includeContext && sortedResults.length > 0
    ? buildWorkspaceSearchContext(sortedResults)
    : undefined;

  return NextResponse.json({
    query,
    workspaceId: workspace.workspaceId,
    results: sortedResults,
    total: sortedResults.length,
    context,
    searchType: semanticAttempted ? "hybrid" : "keyword",
  });
}
