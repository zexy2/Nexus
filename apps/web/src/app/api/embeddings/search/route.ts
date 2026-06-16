import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { aiUnavailableResponse, enforceAiBudget } from "@/lib/production-guardrails";
import { docs } from "@nexus/database/schema";

/**
 * Vector Search API - pgvector semantic search
 * 
 * Protected: Requires authentication
 * Rate Limited: 20 requests per minute (OpenAI API costs)
 * 
 * POST /api/embeddings/search
 * Body: { query: string, limit?: number, workspaceId?: string }
 */

// OpenAI embedding response type
interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function getQueryEmbedding(text: string): Promise<number[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as OpenAIEmbeddingResponse;
  const firstData = data.data[0];
  
  if (!firstData) {
    throw new Error("No embedding returned");
  }
  
  return firstData.embedding;
}

export async function POST(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.embeddings,
  });
  
  if (!protection.success) {
    return protection.response;
  }
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
  }
  const userId = protection.user.id;

  try {
    const body = await request.json();
    const { query, limit = 5, workspaceId } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const access = await requireWorkspaceAccess(userId, workspaceId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const aiBudget = await enforceAiBudget({
      userId,
      email: protection.user.email,
      kind: "embedding",
    });
    if (!aiBudget.ok) return aiBudget.response;

    // Get query embedding
    const embedding = await getQueryEmbedding(query);
    const embeddingStr = `[${embedding.join(",")}]`;
    const safeLimit = Number.isFinite(Number(limit))
      ? Math.min(Math.max(Number(limit), 1), 20)
      : 5;

    // Execute vector similarity search using Drizzle sql template
    // Note: pgvector uses <=> for cosine distance (1 - similarity)
    const result = await db.execute(sql`
      SELECT 
        id,
        doc_id,
        content,
        metadata,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM vectors
      WHERE workspace_id = ${access.workspaceId}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${safeLimit}
    `);
    
    const rows = result as unknown as Array<{
      id: string;
      doc_id: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>;

    return NextResponse.json({
      success: true,
      query,
      results: rows.map(r => ({
        id: r.id,
        docId: r.doc_id,
        content: r.content,
        metadata: r.metadata,
        similarity: r.similarity,
      })),
    });
  } catch (error) {
    console.error("[Vector Search] Error:", error);
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Index a document - create embeddings and store in pgvector
 * 
 * Protected: Requires authentication
 * Rate Limited: 20 requests per minute
 * 
 * PUT /api/embeddings/search
 * Body: { docId: string, content: string, workspaceId: string, metadata?: object }
 */
export async function PUT(request: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.embeddings,
  });
  
  if (!protection.success) {
    return protection.response;
  }
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
  }
  const userId = protection.user.id;

  try {
    const body = await request.json();
    const { docId, content, workspaceId, metadata = {} } = body;

    if (!docId || !content || !workspaceId) {
      return NextResponse.json(
        { error: "docId, content, and workspaceId are required" },
        { status: 400 }
      );
    }

    if (typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId must be a string" },
        { status: 400 }
      );
    }

    const access = await requireWorkspaceAccess(userId, workspaceId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const doc = await db.query.docs.findFirst({
      where: and(eq(docs.id, docId), eq(docs.workspaceId, access.workspaceId)),
      columns: { id: true },
    });
    if (!doc) {
      return NextResponse.json(
        { error: "Document not found in this workspace" },
        { status: 404 }
      );
    }

    const aiBudget = await enforceAiBudget({
      userId,
      email: protection.user.email,
      kind: "embedding",
    });
    if (!aiBudget.ok) return aiBudget.response;

    // Chunk the content (simple approach - split by paragraphs)
    const chunks = content
      .split(/\n\n+/)
      .filter((c: string) => c.trim().length > 50)
      .slice(0, 20); // Max 20 chunks per document

    if (chunks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No content to index",
        chunksCreated: 0,
      });
    }

    // Get embeddings for all chunks
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: chunks,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI API error: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json() as OpenAIEmbeddingResponse;

    // Delete existing vectors for this doc
    await db.execute(sql`DELETE FROM vectors WHERE doc_id = ${docId} AND workspace_id = ${access.workspaceId}`);

    // Insert new vectors
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embData = embeddingData.data[i];
      
      if (!chunk || !embData) continue;
      
      const embedding = embData.embedding;
      const embeddingStr = `[${embedding.join(",")}]`;
      const chunkMetadata = { ...metadata, position: i };

      await db.execute(sql`
        INSERT INTO vectors (source_type, source_id, doc_id, workspace_id, content, embedding, metadata)
        VALUES (
          ${"doc"},
          ${docId},
          ${docId},
          ${access.workspaceId},
          ${chunk},
          ${embeddingStr}::vector,
          ${JSON.stringify(chunkMetadata)}::jsonb
        )
      `);
    }

    return NextResponse.json({
      success: true,
      docId,
      chunksCreated: chunks.length,
    });
  } catch (error) {
    console.error("[Vector Index] Error:", error);
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
