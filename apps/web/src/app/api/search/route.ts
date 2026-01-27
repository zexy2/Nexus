import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { docs, tasks, workspaces, vectors } from "@nexus/database/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: "document" | "task";
  score: number;
  highlight: string;
  updatedAt: string;
}

function searchScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 1);
  
  if (words.length === 0) return 0;
  
  let score = 0;
  for (const word of words) {
    if (textLower.includes(word)) {
      score += 1;
      if (text.toLowerCase().includes(word)) {
        score += 0.5;
      }
    }
  }
  
  if (textLower.includes(queryLower)) {
    score += 2;
  }
  
  return Math.min(score / words.length, 1);
}

function createHighlight(content: string, query: string, maxLength = 150): string {
  if (!content) return "";
  
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  const firstWord = queryLower.split(/\s+/)[0] || "";
  
  const index = contentLower.indexOf(firstWord);
  if (index === -1) {
    return content.slice(0, maxLength) + (content.length > maxLength ? "..." : "");
  }
  
  const start = Math.max(0, index - 30);
  const end = Math.min(content.length, index + maxLength - 30);
  
  let highlight = content.slice(start, end);
  if (start > 0) highlight = "..." + highlight;
  if (end < content.length) highlight = highlight + "...";
  
  return highlight;
}

function extractTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  
  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.content && Array.isArray(block.content)) {
        return block.content.map((c: { text?: string }) => c.text || "").join(" ");
      }
      return "";
    }).join(" ");
  }
  
  return "";
}

async function getUserWorkspace() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  
  // Require authentication - no dev fallback
  if (!userId) return null;
  
  return db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "10");
  
  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }
  
  const workspace = await getUserWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }
  
  const results: SearchResult[] = [];
  
  if (!type || type === "all" || type === "document") {
    const documents = await db.query.docs.findMany({
      where: eq(docs.workspaceId, workspace.id),
      orderBy: [desc(docs.updatedAt)],
    });
    
    for (const doc of documents) {
      const contentText = extractTextFromContent(doc.content);
      const fullText = `${doc.title} ${contentText}`;
      const score = searchScore(query, fullText);
      
      if (score > 0) {
        results.push({
          id: doc.id,
          title: doc.title,
          content: contentText,
          type: "document",
          score,
          highlight: createHighlight(contentText || doc.title, query),
          updatedAt: doc.updatedAt.toISOString(),
        });
      }
    }
  }
  
  if (!type || type === "all" || type === "task") {
    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.workspaceId, workspace.id),
      orderBy: [desc(tasks.updatedAt)],
    });
    
    for (const task of taskList) {
      const fullText = `${task.title} ${task.description || ""}`;
      const score = searchScore(query, fullText);
      
      if (score > 0) {
        results.push({
          id: task.id,
          title: task.title,
          content: task.description || "",
          type: "task",
          score,
          highlight: createHighlight(task.description || task.title, query),
          updatedAt: task.updatedAt.toISOString(),
        });
      }
    }
  }
  
  const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
  
  return NextResponse.json({
    query,
    results: sortedResults,
    total: sortedResults.length,
  });
}

export async function POST(request: NextRequest) {
  // Check authentication first
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { query, options = {} } = body;
  
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }
  
  const { type, limit = 5, includeContext = false, useSemantic = true } = options;
  
  const workspace = await getUserWorkspace();
  if (!workspace) {
    return NextResponse.json({ results: [], total: 0, context: "" });
  }
  
  const results: SearchResult[] = [];
  
  // Try semantic search first if enabled
  if (useSemantic) {
    try {
      const semanticResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/embeddings?q=${encodeURIComponent(query)}&limit=${limit}`,
        { method: 'GET' }
      );
      
      if (semanticResponse.ok) {
        const semanticData = await semanticResponse.json();
        
        for (const result of semanticData.results || []) {
          if (result.document && result.document.workspaceId === workspace.id) {
            results.push({
              id: result.document.id,
              title: result.document.title,
              content: result.content,
              type: "document" as const,
              score: result.similarity,
              highlight: result.content.slice(0, 150) + "...",
              updatedAt: result.document.updatedAt,
            });
          }
        }
      }
    } catch (err) {
      console.error("Semantic search failed, falling back to keyword:", err);
    }
  }
  
  // Keyword search as fallback or supplement
  if (!type || type === "all" || type === "document") {
    const documents = await db.query.docs.findMany({
      where: eq(docs.workspaceId, workspace.id),
      orderBy: [desc(docs.updatedAt)],
    });
    
    for (const doc of documents) {
      // Skip if already in semantic results
      if (results.some(r => r.id === doc.id)) continue;
      
      const contentText = extractTextFromContent(doc.content);
      const score = searchScore(query, `${doc.title} ${contentText}`);
      
      if (score > 0) {
        results.push({
          id: doc.id,
          title: doc.title,
          content: contentText,
          type: "document",
          score: score * 0.8, // Slightly lower weight for keyword matches
          highlight: createHighlight(contentText || doc.title, query),
          updatedAt: doc.updatedAt.toISOString(),
        });
      }
    }
  }

  if (!type || type === "all" || type === "task") {
    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.workspaceId, workspace.id),
      orderBy: [desc(tasks.updatedAt)],
    });
    
    for (const task of taskList) {
      const score = searchScore(query, `${task.title} ${task.description || ""}`);
      
      if (score > 0) {
        results.push({
          id: task.id,
          title: task.title,
          content: task.description || "",
          type: "task",
          score,
          highlight: createHighlight(task.description || task.title, query),
          updatedAt: task.updatedAt.toISOString(),
        });
      }
    }
  }

  const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
  
  let context: string | undefined;
  if (includeContext && sortedResults.length > 0) {
    context = "### Relevant Context from Workspace:\n\n";
    for (const result of sortedResults.slice(0, 3)) {
      context += `**${result.title}** (${result.type}, relevance: ${(result.score * 100).toFixed(0)}%)\n${result.content.slice(0, 500)}\n\n`;
    }
  }

  return NextResponse.json({ 
    query, 
    results: sortedResults, 
    total: sortedResults.length, 
    context,
    searchType: useSemantic ? "hybrid" : "keyword"
  });
}
