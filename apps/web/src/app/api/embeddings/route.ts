import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vectors, docs } from "@nexus/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { aiUnavailableResponse, enforceAiBudget } from "@/lib/production-guardrails";

export const runtime = "nodejs";

// Extract plain text from BlockNote JSON content
function extractTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  
  if (Array.isArray(content)) {
    return content.map((block: Record<string, unknown>) => {
      if (block.content && Array.isArray(block.content)) {
        return block.content
          .map((c: Record<string, unknown>) => (c.text as string) || "")
          .join(" ");
      }
      return "";
    }).join("\n");
  }
  
  return "";
}

// Chunk text for embeddings
function chunkText(text: string, chunkSize = 500): { content: string; position: number }[] {
  const chunks: { content: string; position: number }[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = "";
  let position = 0;
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), position });
      currentChunk = sentence;
      position++;
    } else {
      currentChunk += " " + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({ content: currentChunk.trim(), position });
  }
  
  return chunks.length > 0 ? chunks : [{ content: text, position: 0 }];
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000), // Limit input length
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error("Embedding generation failed:", error);
    throw error;
  }
}

// POST - Generate embeddings for a document
// Protected: Requires authentication
// Rate Limited: 20 requests per minute (OpenAI costs)
export async function POST(req: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(req, {
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

  try {
    const { docId, workspaceId, forceRegenerate = false } = await req.json();
    
    if (!docId) {
      return NextResponse.json({ error: "docId is required" }, { status: 400 });
    }
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess(protection.user.id, workspaceId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Get the document
    const doc = await db.query.docs.findFirst({
      where: and(eq(docs.id, docId), eq(docs.workspaceId, access.workspaceId)),
    });
    
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    
    // Extract text content
    const textContent = extractTextFromContent(doc.content);
    if (!textContent.trim()) {
      return NextResponse.json({ 
        message: "No text content to embed",
        chunksCreated: 0 
      });
    }
    
    if (!forceRegenerate) {
      const existingVectors = await db.query.vectors.findFirst({
        where: and(eq(vectors.sourceId, docId), eq(vectors.workspaceId, access.workspaceId)),
      });
      if (existingVectors) {
        return NextResponse.json({
          message: "Embeddings already exist",
          chunksCreated: 0
        });
      }
    }

    // Budget is consumed only when embeddings will actually be generated
    // (valid, authorized request for an existing document with content).
    const aiBudget = await enforceAiBudget({
      userId: protection.user.id,
      email: protection.user.email,
      kind: "embedding",
    });
    if (!aiBudget.ok) return aiBudget.response;

    // Delete existing vectors for this document if regenerating
    if (forceRegenerate) {
      await db.delete(vectors).where(and(eq(vectors.sourceId, docId), eq(vectors.workspaceId, access.workspaceId)));
    }

    // Chunk the content
    const chunks = chunkText(textContent);
    
    // Generate embeddings for each chunk
    const vectorRecords = [];
    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk.content);
      
      vectorRecords.push({
        sourceType: "doc" as const,
        sourceId: docId,
        docId,
        workspaceId: access.workspaceId,
        content: chunk.content,
        embedding,
        embeddingJson: embedding,
        metadata: {
          title: doc.title,
          position: chunk.position,
          docId: docId,
        },
      });
    }
    
    // Insert vectors
    if (vectorRecords.length > 0) {
      await db.insert(vectors).values(vectorRecords);
    }
    
    return NextResponse.json({
      message: "Embeddings generated successfully",
      docId,
      workspaceId: access.workspaceId,
      chunksCreated: vectorRecords.length,
    });
  } catch (error) {
    console.error("Embedding generation error:", error);
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
    }
    return NextResponse.json(
      { error: "Failed to generate embeddings" },
      { status: 500 }
    );
  }
}

// GET - Search using vector similarity
// Protected: Requires authentication
// Rate Limited: 20 requests per minute
export async function GET(req: NextRequest) {
  // Auth + Rate Limit check
  const protection = await protectRoute(req, {
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

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const workspaceId = searchParams.get("workspaceId");
    const parsedLimit = parseInt(searchParams.get("limit") || "5", 10);
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 5;
    const parsedThreshold = parseFloat(searchParams.get("threshold") || "0.3");
    const safeThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 0.3;
    
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess(protection.user.id, workspaceId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    
    const aiBudget = await enforceAiBudget({
      userId: protection.user.id,
      email: protection.user.email,
      kind: "embedding",
    });
    if (!aiBudget.ok) return aiBudget.response;

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Nearest-neighbour search runs in Postgres (pgvector `<=>` = cosine
    // distance, served by vectors_embedding_hnsw_idx) instead of loading every
    // vector of the workspace into memory.
    const rows = (await db.execute(sql`
      SELECT id, source_id, content, metadata,
             1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM vectors
      WHERE source_type = 'doc'
        AND workspace_id = ${access.workspaceId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${safeLimit}
    `)) as unknown as Array<{
      id: string;
      source_id: string;
      content: string;
      metadata: Record<string, unknown> | null;
      similarity: number | string;
    }>;

    const results = rows
      .map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        content: row.content,
        similarity: Number(row.similarity),
        metadata: row.metadata,
      }))
      .filter((row) => row.similarity >= safeThreshold);

    // Associated documents in one query (was one query per document).
    const docIds = [...new Set(results.map((r) => r.sourceId))];
    const docsList =
      docIds.length > 0
        ? await db
            .select()
            .from(docs)
            .where(and(inArray(docs.id, docIds), eq(docs.workspaceId, access.workspaceId)))
        : [];

    const docsMap = new Map(docsList.map((d) => [d.id, d]));

    const enrichedResults = results.map(r => ({
      ...r,
      document: docsMap.get(r.sourceId) || null,
    }));

    return NextResponse.json({
      query,
      results: enrichedResults,
      totalFound: results.length,
    });
  } catch (error) {
    console.error("Vector search error:", error);
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return aiUnavailableResponse("OpenAI embeddings are not configured on this server.");
    }
    return NextResponse.json(
      { error: "Failed to search" },
      { status: 500 }
    );
  }
}
