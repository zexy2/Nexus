/**
 * Temporal Activities
 * 
 * Activities are the building blocks of workflows. They perform
 * the actual work like calling AI agents, saving to database, etc.
 */

import type { AgentStepResult } from "./types";

// Gemini API call helper
async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  if (process.env.AI_ENABLED === "false") {
    throw new Error("AI is disabled");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ==========================================
// WEB SEARCH ACTIVITY (Tavily)
// ==========================================

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Search the web using Tavily API
 */
export async function searchWeb(
  query: string,
  options?: { maxResults?: number; searchDepth?: "basic" | "advanced" }
): Promise<{ results: TavilySearchResult[]; answer?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    throw new Error("TAVILY_NOT_CONFIGURED");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options?.maxResults || 5,
      search_depth: options?.searchDepth || "basic",
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json() as {
    results: Array<{ title: string; url: string; content: string; score: number }>;
    answer?: string;
  };
  
  return {
    results: data.results.map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    })),
    answer: data.answer,
  };
}

// ==========================================
// VECTOR SEARCH ACTIVITY (pgvector)
// ==========================================

/**
 * Generate embeddings using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Embeddings error: ${response.status}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };
  
  return data.data[0]?.embedding || [];
}

/**
 * Search documents using pgvector similarity
 */
export async function searchVectors(
  query: string,
  options?: { limit?: number; workspaceId?: string }
): Promise<Array<{ id: string; content: string; similarity: number; metadata: Record<string, unknown> }>> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  // Generate query embedding
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Import postgres dynamically
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    let queryText = `
      SELECT id, content, metadata,
             1 - (embedding <=> $1::vector) as similarity
      FROM vectors
    `;
    
    const params: (string | number)[] = [embeddingStr];
    let paramIndex = 2;

    if (options?.workspaceId) {
      queryText += ` WHERE workspace_id = $${paramIndex}`;
      params.push(options.workspaceId);
      paramIndex++;
    }

    queryText += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(options?.limit || 5);

    const results = await sql.unsafe(queryText, params) as Array<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>;
    
    return results;
  } finally {
    await sql.end();
  }
}

/**
 * Index a document in pgvector
 */
export async function indexDocument(
  docId: string,
  content: string,
  workspaceId: string,
  metadata?: Record<string, unknown>
): Promise<{ chunksCreated: number }> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  // Chunk content
  const chunks = content
    .split(/\n\n+/)
    .filter(c => c.trim().length > 50)
    .slice(0, 20);

  if (chunks.length === 0) {
    return { chunksCreated: 0 };
  }

  // Generate embeddings
  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);
    embeddings.push(embedding);
  }

  // Import postgres
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    // Delete existing
    await sql`DELETE FROM vectors WHERE doc_id = ${docId}`;

    // Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      if (!chunk || !embedding) continue;
      
      const embeddingStr = `[${embedding.join(",")}]`;
      const chunkMetadata = { ...metadata, position: i };

      await sql`
        INSERT INTO vectors (source_type, source_id, doc_id, workspace_id, content, embedding, metadata)
        VALUES (${"doc"}, ${docId}, ${docId}, ${workspaceId}, ${chunk}, ${embeddingStr}::vector, ${JSON.stringify(chunkMetadata)}::jsonb)
      `;
    }

    return { chunksCreated: chunks.length };
  } finally {
    await sql.end();
  }
}

/**
 * Call the research agent to gather information
 */
export async function callResearchAgent(
  query: string,
  sources: string[]
): Promise<AgentStepResult> {
  const startTime = Date.now();
  
  const systemPrompt = `You are a Research Agent. Gather comprehensive information about the topic.
Sources to consider: ${sources.join(", ")}
Provide well-organized findings with key insights.`;

  const output = await callGemini(systemPrompt, query);
  
  return {
    agentName: "research",
    input: query,
    output,
    success: true,
    duration: Date.now() - startTime,
    tokensUsed: Math.round(output.length / 4),
  };
}

/**
 * Call the writer agent to create content
 */
export async function callWriterAgent(
  prompt: string,
  context?: string
): Promise<AgentStepResult> {
  const startTime = Date.now();
  
  const systemPrompt = `You are a Writer Agent. Create well-structured, professional content.
Format output in Markdown. Be clear and engaging.`;

  const fullPrompt = context ? `Context:\n${context}\n\n---\n\nTask: ${prompt}` : prompt;
  const output = await callGemini(systemPrompt, fullPrompt);
  
  return {
    agentName: "writer",
    input: prompt,
    output,
    success: true,
    duration: Date.now() - startTime,
    tokensUsed: Math.round(output.length / 4),
  };
}

/**
 * Call the coder agent to generate code
 */
export async function callCoderAgent(
  specification: string,
  language: string
): Promise<AgentStepResult> {
  const startTime = Date.now();
  
  const systemPrompt = `You are a Coder Agent. Write clean, production-ready ${language} code.
Follow best practices, add comments, and handle edge cases.`;

  const output = await callGemini(systemPrompt, specification);
  
  return {
    agentName: "coder",
    input: specification,
    output,
    success: true,
    duration: Date.now() - startTime,
    tokensUsed: Math.round(output.length / 4),
  };
}

/**
 * Call the task agent to break down a project
 */
export async function callTaskAgent(
  projectDescription: string
): Promise<AgentStepResult> {
  const startTime = Date.now();
  
  const systemPrompt = `You are a Task Agent. Break down projects into actionable tasks.
Format as JSON array: [{"title": "Task name", "description": "...", "priority": "high|medium|low"}]`;

  const output = await callGemini(systemPrompt, projectDescription);
  
  return {
    agentName: "task",
    input: projectDescription,
    output,
    success: true,
    duration: Date.now() - startTime,
    tokensUsed: Math.round(output.length / 4),
  };
}

/**
 * Save a document to the database
 */
export async function saveDocument(
  workspaceId: string,
  title: string,
  content: string,
  createdBy: string
): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);
  const blockContent = [
    {
      id: `workflow-${Date.now()}`,
      type: "paragraph",
      props: {
        textColor: "default",
        backgroundColor: "default",
        textAlignment: "left",
      },
      content: [{ type: "text", text: content, styles: {} }],
      children: [],
    },
  ];

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO docs (workspace_id, title, icon_emoji, content, created_by)
      VALUES (${workspaceId}, ${title || "Generated Document"}, ${"✨"}, ${JSON.stringify(blockContent)}::jsonb, ${createdBy})
      RETURNING id
    `;

    const documentId = rows[0]?.id;
    if (!documentId) {
      throw new Error("Document insert did not return an id");
    }

    try {
      await indexDocument(documentId, content, workspaceId, { title });
    } catch (error) {
      console.warn("[Activity] Document saved but embedding index failed:", error);
    }

    try {
      await sql`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${createdBy},
          ${workspaceId},
          ${"document.create"},
          ${"success"},
          ${JSON.stringify({ docId: documentId, title, source: "workflow" })}::jsonb
        )
      `;
    } catch (error) {
      console.warn("[Activity] Document saved but audit log failed:", error);
    }

    return documentId;
  } finally {
    await sql.end();
  }
}

/**
 * Save tasks to the database
 */
export async function saveTasks(
  workspaceId: string,
  tasks: Array<{ title: string; description: string; priority: string }>,
  createdBy: string
): Promise<string[]> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    const taskIds: string[] = [];

    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];
      if (!task?.title?.trim()) continue;

      const priority = ["low", "medium", "high", "urgent"].includes(task.priority)
        ? task.priority
        : "medium";

      const rows = await sql<{ id: string }[]>`
        INSERT INTO tasks (workspace_id, title, description, status, priority, position, created_by, assignee_id)
        VALUES (
          ${workspaceId},
          ${task.title.slice(0, 500)},
          ${task.description || ""},
          ${"todo"},
          ${priority},
          ${index},
          ${createdBy},
          ${createdBy}
        )
        RETURNING id
      `;

      if (rows[0]?.id) {
        taskIds.push(rows[0].id);
        try {
          await sql`
            INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
            VALUES (
              ${createdBy},
              ${workspaceId},
              ${"task.create"},
              ${"success"},
              ${JSON.stringify({ taskId: rows[0].id, title: task.title, source: "workflow" })}::jsonb
            )
          `;
        } catch (error) {
          console.warn("[Activity] Task saved but audit log failed:", error);
        }
      }
    }

    return taskIds;
  } finally {
    await sql.end();
  }
}

/**
 * Send a notification to the user
 */
export async function sendNotification(
  userId: string,
  message: string,
  type: "info" | "success" | "error"
): Promise<void> {
  await sleep(100);
  console.log(`[Activity] Notification to ${userId}: ${message} (${type})`);
}

/**
 * Search documents using vector similarity (uses searchVectors internally)
 */
export async function searchDocuments(
  workspaceId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  const results = await searchVectors(query, { limit, workspaceId });
  
  return results.map(r => ({
    id: r.id,
    title: (r.metadata?.title as string) || "Untitled",
    similarity: r.similarity,
  }));
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
