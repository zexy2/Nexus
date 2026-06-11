import { db } from "@/lib/db";
import { docs, tasks } from "@nexus/database/schema";
import { desc, eq } from "drizzle-orm";

export interface WorkspaceSearchResult {
  id: string;
  title: string;
  content: string;
  type: "document" | "task";
  score: number;
  highlight: string;
  updatedAt: string;
}

export function searchScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const words = queryLower.split(/\s+/).filter((word) => word.length > 1);

  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    if (textLower.includes(word)) score += 1;
  }

  if (textLower.includes(queryLower)) score += 2;

  return Math.min(score / words.length, 1);
}

export function createHighlight(content: string, query: string, maxLength = 150): string {
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
  if (start > 0) highlight = `...${highlight}`;
  if (end < content.length) highlight = `${highlight}...`;

  return highlight;
}

export function extractTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (
          block &&
          typeof block === "object" &&
          "content" in block &&
          Array.isArray(block.content)
        ) {
          return block.content.map((item: { text?: string }) => item.text || "").join(" ");
        }
        return "";
      })
      .join(" ");
  }

  return "";
}

export async function searchWorkspaceContent(
  query: string,
  workspaceId: string,
  options: { type?: string; limit?: number } = {}
): Promise<WorkspaceSearchResult[]> {
  const { type, limit = 10 } = options;
  const results: WorkspaceSearchResult[] = [];

  if (!workspaceId || !query.trim()) return results;

  if (!type || type === "all" || type === "document") {
    const documents = await db.query.docs.findMany({
      where: eq(docs.workspaceId, workspaceId),
      orderBy: [desc(docs.updatedAt)],
    });

    for (const doc of documents) {
      const contentText = extractTextFromContent(doc.content);
      const score = searchScore(query, `${doc.title} ${contentText}`);

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
      where: eq(tasks.workspaceId, workspaceId),
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

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildWorkspaceSearchContext(results: WorkspaceSearchResult[]): string {
  if (results.length === 0) return "";

  let context = "### Relevant Context from Workspace:\n\n";
  for (const result of results.slice(0, 3)) {
    context += `**${result.title}** (${result.type}, relevance: ${(result.score * 100).toFixed(0)}%)\n${result.content.slice(0, 500)}\n\n`;
  }
  return context;
}
