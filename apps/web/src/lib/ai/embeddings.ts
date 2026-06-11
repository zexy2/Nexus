/**
 * Semantic search over workspace embeddings (pgvector).
 *
 * Documents are chunked and embedded into the `vectors` table (OpenAI
 * text-embedding-3-small, 1536 dims) by the embeddings routes. This module
 * embeds a query and runs a pgvector cosine-similarity search, scoped to a
 * single workspace. RAG retrieval uses this instead of naive keyword matching
 * when embeddings are configured.
 */
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { docs } from "@nexus/database/schema";

const EMBEDDING_MODEL = "text-embedding-3-small";

export function isEmbeddingsAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Generate an embedding for a piece of text via OpenAI. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings error: ${response.status}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("No embedding returned");
  }
  return embedding;
}

export interface SemanticHit {
  docId: string | null;
  content: string;
  similarity: number;
}

/**
 * Cosine-similarity search over a workspace's chunk embeddings. Workspace-scoped
 * (never crosses tenants). Returns [] when embeddings aren't configured or there
 * are no matches, so callers can fall back to keyword retrieval.
 */
export async function semanticSearch(
  query: string,
  workspaceId: string,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<SemanticHit[]> {
  if (!isEmbeddingsAvailable() || !workspaceId || !query.trim()) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const minSimilarity = options.minSimilarity ?? 0;

  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  // pgvector: `<=>` is cosine distance, so similarity = 1 - distance.
  const result = await db.execute(sql`
    SELECT doc_id, content, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM vectors
    WHERE workspace_id = ${workspaceId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `);

  const rows = result as unknown as Array<{
    doc_id: string | null;
    content: string;
    similarity: number;
  }>;

  return rows
    .filter((r) => Number(r.similarity) >= minSimilarity)
    .map((r) => ({ docId: r.doc_id, content: r.content, similarity: Number(r.similarity) }));
}

/**
 * Render semantic hits into a workspace-context string, resolving doc titles in
 * one query. Shared format with the keyword RAG fallback.
 */
export async function buildSemanticContext(hits: SemanticHit[]): Promise<string> {
  if (hits.length === 0) return "";

  const docIds = [...new Set(hits.map((h) => h.docId).filter((id): id is string => !!id))];
  const titleById = new Map<string, string>();
  if (docIds.length > 0) {
    const rows = await db.select({ id: docs.id, title: docs.title }).from(docs).where(inArray(docs.id, docIds));
    for (const row of rows) titleById.set(row.id, row.title);
  }

  let context = "\n\n### 📚 Relevant context from your workspace:\n\n";
  for (const hit of hits.slice(0, 3)) {
    const title = (hit.docId && titleById.get(hit.docId)) || "Document";
    context += `**${title}** (relevance: ${Math.round(hit.similarity * 100)}%)\n${hit.content.slice(0, 500)}\n\n`;
  }
  return context;
}
