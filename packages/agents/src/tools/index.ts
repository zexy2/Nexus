/**
 * Agent Tools
 * 
 * LangChain tool definitions for agent capabilities:
 * - Web Search (Tavily)
 * - Vector Store (pgvector)
 * - Document Operations
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// ==========================================
// WEB SEARCH TOOL (Tavily)
// ==========================================

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  followUpQuestions?: string[];
}

async function searchTavily(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
  }
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.warn("[Tavily] TAVILY_API_KEY not set, returning empty results");
    return {
      query,
      results: [],
      answer: "Web search is not configured. Please set TAVILY_API_KEY.",
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options?.maxResults || 5,
      search_depth: options?.searchDepth || "basic",
      include_answer: options?.includeAnswer ?? true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json() as {
    query: string;
    results: Array<{
      title: string;
      url: string;
      content: string;
      score?: number;
      published_date?: string;
    }>;
    answer?: string;
    follow_up_questions?: string[];
  };
  
  return {
    query: data.query,
    results: data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score || 0,
      publishedDate: r.published_date,
    })),
    answer: data.answer,
    followUpQuestions: data.follow_up_questions,
  };
}

export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description: "Search the web for current information. Use this for finding recent news, facts, documentation, or any information that might be online.",
  schema: z.object({
    query: z.string().describe("The search query to look up on the web"),
    maxResults: z.number().optional().default(5).describe("Maximum number of results to return"),
    searchDepth: z.enum(["basic", "advanced"]).optional().default("basic").describe("Search depth - 'advanced' provides more detailed results"),
  }),
  func: async ({ query, maxResults, searchDepth }) => {
    try {
      const result = await searchTavily(query, { maxResults, searchDepth });
      
      // Format results for the agent
      let output = "";
      
      if (result.answer) {
        output += `**Summary**: ${result.answer}\n\n`;
      }
      
      if (result.results.length > 0) {
        output += "**Sources**:\n";
        for (const r of result.results) {
          output += `- [${r.title}](${r.url})\n  ${r.content.slice(0, 200)}...\n\n`;
        }
      }
      
      return output || "No results found for this query.";
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});

// ==========================================
// VECTOR STORE TOOL (pgvector)
// ==========================================

export interface VectorSearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

// OpenAI embedding response type
interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

async function searchVectors(
  query: string,
  options?: {
    limit?: number;
    workspaceId?: string;
    documentType?: "document" | "task" | "message";
  }
): Promise<VectorSearchResult[]> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.warn("[VectorStore] DATABASE_URL not set");
    return [];
  }

  try {
    // First, get embedding for the query using OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.warn("[VectorStore] OPENAI_API_KEY not set for embeddings");
      return [];
    }

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI Embeddings error: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json() as OpenAIEmbeddingResponse;
    const firstData = embeddingData.data[0];
    if (!firstData) {
      throw new Error("No embedding returned from OpenAI");
    }
    const queryEmbedding = firstData.embedding;

    const limit = options?.limit || 5;
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl);
    
    try {
      const rows = options?.workspaceId
        ? await sql<Array<{
            id: string;
            content: string;
            similarity: number;
            metadata: Record<string, unknown> | null;
          }>>`
            SELECT id, content, 1 - (embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector) as similarity, metadata
            FROM vectors
            WHERE workspace_id = ${options.workspaceId}
            ORDER BY embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector
            LIMIT ${limit}
          `
        : await sql<Array<{
            id: string;
            content: string;
            similarity: number;
            metadata: Record<string, unknown> | null;
          }>>`
            SELECT id, content, 1 - (embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector) as similarity, metadata
            FROM vectors
            ORDER BY embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector
            LIMIT ${limit}
          `;

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        similarity: Number(row.similarity),
        metadata: row.metadata || {},
      }));
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error("[VectorStore] Search error:", error);
    return [];
  }
}

export const vectorSearchTool = new DynamicStructuredTool({
  name: "search_documents",
  description: "Search through workspace documents, tasks, and messages using semantic similarity. Use this to find relevant internal content.",
  schema: z.object({
    query: z.string().describe("The search query - will be matched semantically against document content"),
    limit: z.number().optional().default(5).describe("Maximum number of results"),
    workspaceId: z.string().optional().describe("Optional workspace ID to limit search scope"),
    documentType: z.enum(["document", "task", "message"]).optional().describe("Filter by document type"),
  }),
  func: async ({ query, limit, workspaceId, documentType }) => {
    try {
      const results = await searchVectors(query, { limit, workspaceId, documentType });
      
      if (results.length === 0) {
        return "No relevant documents found.";
      }
      
      let output = "**Relevant Documents**:\n\n";
      for (const r of results) {
        const similarity = (r.similarity * 100).toFixed(1);
        const title = (r.metadata.title as string) || "Untitled";
        output += `### ${title} (${similarity}% match)\n`;
        output += `${r.content.slice(0, 300)}...\n\n`;
      }
      
      return output;
    } catch (error) {
      return `Document search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});

// ==========================================
// ALL TOOLS EXPORT
// ==========================================

export const agentTools = [webSearchTool, vectorSearchTool];

// Export individual tool functions for direct use
export { searchTavily, searchVectors };
