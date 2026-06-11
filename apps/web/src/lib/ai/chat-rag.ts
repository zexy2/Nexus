/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Workspace RAG context for chat.
 *
 * Retrieval order: semantic (pgvector) when OpenAI embeddings are configured →
 * Corrective RAG → keyword scoring. All paths are workspace-scoped.
 */
import { db } from "@/lib/db";
import { docs, tasks } from "@nexus/database/schema";
import { eq, desc } from "drizzle-orm";
import { correctiveRAG } from "@/lib/ai/crag";
import { isEmbeddingsAvailable, semanticSearch, buildSemanticContext } from "@/lib/ai/embeddings";

// Extract text from BlockNote JSON content
export function extractTextFromContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.content && Array.isArray(block.content)) {
        return block.content.map((c: any) => c.text || "").join(" ");
      }
      return "";
    }).join(" ");
  }

  return "";
}

// Simple text search scoring for RAG
export function searchScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    if (textLower.includes(word)) {
      score += 1;
    }
  }

  if (textLower.includes(queryLower)) {
    score += 2;
  }

  return score / words.length;
}

// Get RAG context from workspace documents.
// Prefers semantic (pgvector) retrieval when embeddings are configured, and
// falls back to Corrective RAG / keyword scoring otherwise.
export async function getRAGContext(query: string, workspaceId: string): Promise<string> {
  // 1) Semantic retrieval via pgvector (when OpenAI embeddings are available).
  if (isEmbeddingsAvailable()) {
    try {
      const hits = await semanticSearch(query, workspaceId, { limit: 3, minSimilarity: 0.2 });
      if (hits.length > 0) {
        return await buildSemanticContext(hits);
      }
      // No vector hits (e.g. docs not embedded yet) — fall through to keyword.
    } catch (e) {
      console.error("[RAG] Semantic search failed, falling back:", e);
    }
  }

  const USE_CRAG = process.env.USE_CRAG !== "false"; // Default to true

  try {
    if (USE_CRAG) {
      const cragResult = await correctiveRAG(query, workspaceId, {
        maxCorrections: 2,
        relevanceThreshold: 0.4,
        minRelevantDocs: 1,
        includeWebSearch: false, // Don't use web in RAG, separate step
        useGeminiForEval: false,
      });

      if (cragResult.relevantDocuments.length === 0) {
        return "";
      }

      let context = "\n\n### 📚 Relevant context from your workspace:\n\n";
      for (const doc of cragResult.relevantDocuments.slice(0, 3)) {
        context += `**${doc.source}** (relevance: ${Math.round(doc.relevanceScore * 100)}%)\n${doc.content.slice(0, 500)}\n\n`;
      }

      return context;
    }

    // Fallback to simple RAG if CRAG is disabled
    const documents = await db.query.docs.findMany({
      where: eq(docs.workspaceId, workspaceId),
      orderBy: [desc(docs.updatedAt)],
      limit: 20,
    });

    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.workspaceId, workspaceId),
      orderBy: [desc(tasks.updatedAt)],
      limit: 20,
    });

    const results: { title: string; content: string; score: number; type: string }[] = [];

    for (const doc of documents) {
      const contentText = extractTextFromContent(doc.content);
      const fullText = `${doc.title} ${contentText}`;
      const score = searchScore(query, fullText);

      if (score > 0.3) {
        results.push({
          title: doc.title,
          content: contentText.slice(0, 500),
          score,
          type: "document"
        });
      }
    }

    for (const task of taskList) {
      const fullText = `${task.title} ${task.description || ""}`;
      const score = searchScore(query, fullText);

      if (score > 0.3) {
        results.push({
          title: task.title,
          content: task.description || "",
          score,
          type: "task"
        });
      }
    }

    const topResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (topResults.length === 0) return "";

    let context = "\n\n### 📚 Relevant context from your workspace:\n\n";
    for (const r of topResults) {
      context += `**${r.title}** (${r.type})\n${r.content}\n\n`;
    }

    return context;
  } catch (e) {
    console.error("RAG error:", e);
    return "";
  }
}
