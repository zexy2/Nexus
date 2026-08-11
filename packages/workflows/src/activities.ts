/**
 * Temporal Activities
 * 
 * Activities are the building blocks of workflows. They perform
 * the actual work like calling AI agents, saving to database, etc.
 */

import {
  createCipheriv,
  createDecipheriv,
  createSign,
  randomBytes,
} from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
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

async function callGeminiJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
  if (process.env.AI_ENABLED === "false") {
    throw new Error("AI is disabled");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini returned an empty plan analysis");
  }

  const candidate = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("Gemini returned invalid plan analysis JSON");
    }
    return JSON.parse(objectMatch[0]);
  }
}

type PlanRequirementAnalysis = {
  stableKey: string;
  previousStableKey?: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  changeType: "added" | "modified" | "unchanged" | "removed";
  confidence: number;
};

type PlanProposalAnalysis = {
  action:
    | "create_task"
    | "update_task"
    | "archive_task"
    | "relink_task"
    | "linear_create_issue"
    | "linear_update_issue"
    | "linear_comment"
    | "github_create_issue"
    | "github_issue_comment"
    | "github_issue_update"
    | "github_issue_label"
    | "mark_agent_job_outdated";
  requirementStableKey?: string;
  taskId?: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  rationale: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

type PlanAnalysis = {
  docId: string;
  workspaceId: string;
  userId: string;
  title: string;
  content: unknown;
  contentText: string;
  baseVersionId: string | null;
  nextVersionNumber: number;
  summary: string;
  requirements: PlanRequirementAnalysis[];
  proposals: PlanProposalAnalysis[];
  steps: AgentStepResult[];
};

type PlanOutputLanguage = "tr" | "en";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textFromDocumentContent(value: unknown): string {
  const chunks: string[] = [];

  const visit = (node: unknown) => {
    if (typeof node === "string") {
      chunks.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    if (record.content !== undefined) visit(record.content);
    if (record.children !== undefined) visit(record.children);
  };

  visit(value);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function deriveDocumentTitle(title: string, content: string): string {
  const explicitTitle = title.trim();
  if (explicitTitle) return explicitTitle.slice(0, 120);

  const cleaned = content
    .replace(/[#*_`>~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Untitled Plan";

  const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned;
  return firstSentence.length > 90
    ? `${firstSentence.slice(0, 87).trim()}...`
    : firstSentence;
}

function detectPlanOutputLanguage(text: string): PlanOutputLanguage {
  const normalized = text.toLocaleLowerCase("tr-TR");
  const turkishSignals = [
    /[çğıöşü]/i.test(text) ? 3 : 0,
    /\b(ve|veya|ile|için|görev|plan|amaç|hedef|kullanıcı|müşteri|özellik|uygulama|yönetim|teslimat|gereksinim)\b/u.test(normalized) ? 2 : 0,
    /\b(oluştur|sağla|izle|güncelle|başlat|sipariş|restoran|ödeme|mobil)\b/u.test(normalized) ? 2 : 0,
  ].reduce((sum, score) => sum + score, 0);

  return turkishSignals >= 2 ? "tr" : "en";
}

function planLanguageName(language: PlanOutputLanguage) {
  return language === "tr" ? "Turkish" : "English";
}

function planCopy(language: PlanOutputLanguage) {
  if (language === "tr") {
    return {
      updateLinkedTask: "Bağlı görevi güncelle",
      createLinkedTask: "Bağlı görev oluştur",
      alignedRationale: "Teslimat işini güncel planla hizalı tut.",
      addedNoWork: (key: string) => `${key} için henüz teslimat işi yok.`,
      changedNoTask: (key: string) => `${key} değişti ve bağlı görevi yok.`,
      changedAfterTask: (key: string) => `${key}, bu görev oluşturulduktan sonra değişti.`,
      removedFromPlan: (key: string) => `${key} plandan kaldırıldı.`,
      comparedSummary: "Plan değişiklikleri kabul edilmiş referans sürümle karşılaştırıldı.",
      initialSummary: "İlk gereksinimler ve teslimat işleri plandan çıkarıldı.",
      stepInput: (title: string) => `${title} planını analiz et`,
    };
  }

  return {
    updateLinkedTask: "Update linked task",
    createLinkedTask: "Create linked task",
    alignedRationale: "Keep delivery work aligned with the current plan.",
    addedNoWork: (key: string) => `${key} has no delivery work yet.`,
    changedNoTask: (key: string) => `${key} changed and has no linked task.`,
    changedAfterTask: (key: string) => `${key} changed after this task was created.`,
    removedFromPlan: (key: string) => `${key} was removed from the plan.`,
    comparedSummary: "Plan changes were compared with the accepted baseline.",
    initialSummary: "Initial requirements and delivery work were extracted from the plan.",
    stepInput: (title: string) => `Analyze ${title}`,
  };
}

function normalizePriority(value: unknown): "low" | "medium" | "high" | "urgent" {
  const priority = typeof value === "string" ? value.toLowerCase() : "medium";
  return ["low", "medium", "high", "urgent"].includes(priority)
    ? priority as "low" | "medium" | "high" | "urgent"
    : "medium";
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 70;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeStableKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().toUpperCase().match(/^REQ-(\d{1,6})$/);
  return match ? `REQ-${match[1]!.padStart(3, "0")}` : null;
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
  sources: string[],
  suppliedContext = ""
): Promise<AgentStepResult & { sources: Array<{ title: string; url?: string; snippet: string; relevance: number }> }> {
  const startTime = Date.now();
  const wantsWeb = sources.some((source) => source === "web" || source === "both");
  const webResult = wantsWeb && process.env.TAVILY_API_KEY
    ? await searchWeb(query, { maxResults: 5, searchDepth: "advanced" })
    : null;
  const webSources = webResult?.results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content.slice(0, 320),
    relevance: result.score,
  })) ?? [];
  const sourceContext = [
    suppliedContext,
    webResult?.answer,
    ...webSources.map((source) => `${source.title}\n${source.snippet}\nURL: ${source.url}`),
  ].filter(Boolean).join("\n\n---\n\n");

  const systemPrompt = sourceContext
    ? `You are a research synthesizer. Use only the supplied material for factual claims. Distinguish facts from inference, state uncertainty, and cite supplied URLs. Never invent a source.`
    : `You are an analysis assistant. No external or workspace sources were supplied. Provide a planning analysis, explicitly disclose that it is model-generated, and do not describe it as verified research.`;
  const output = await callGemini(
    systemPrompt,
    `${query}\n\n${sourceContext ? `SUPPLIED MATERIAL:\n${sourceContext}` : "No source material is available."}`
  );
  
  return {
    agentName: "research",
    input: query,
    output,
    success: true,
    duration: Date.now() - startTime,
    tokensUsed: Math.round(output.length / 4),
    sources: webSources,
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
  const documentTitle = deriveDocumentTitle(title, content);

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO docs (workspace_id, title, icon_emoji, content, created_by, is_ai_generated)
      VALUES (${workspaceId}, ${documentTitle}, ${"✨"}, ${JSON.stringify(blockContent)}::jsonb, ${createdBy}, 1)
      RETURNING id
    `;

    const documentId = rows[0]?.id;
    if (!documentId) {
      throw new Error("Document insert did not return an id");
    }

    try {
      await indexDocument(documentId, content, workspaceId, { title: documentTitle });
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
  createdBy: string,
  docId?: string
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
        INSERT INTO tasks (
          workspace_id,
          doc_id,
          title,
          description,
          status,
          priority,
          position,
          is_archived,
          alignment_status,
          alignment_updated_at,
          created_by,
          assignee_id
        )
        VALUES (
          ${workspaceId},
          ${docId || null},
          ${task.title.slice(0, 500)},
          ${task.description || ""},
          ${"todo"},
          ${priority},
          ${index},
          ${0},
          ${docId ? "needs_review" : "orphaned"},
          ${docId ? new Date() : null},
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

export async function analyzePlanImpact(input: {
  workspaceId: string;
  userId: string;
  docId: string;
}): Promise<PlanAnalysis> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);
  const startedAt = Date.now();

  try {
    const docs = await sql<Array<{
      id: string;
      workspace_id: string;
      title: string;
      content: unknown;
    }>>`
      SELECT id, workspace_id, title, content
      FROM docs
      WHERE id = ${input.docId}
        AND workspace_id = ${input.workspaceId}
        AND is_archived = 0
      LIMIT 1
    `;
    const doc = docs[0];
    if (!doc) throw new Error("Plan document not found");

    const previousVersions = await sql<Array<{
      id: string;
      version_number: number;
      content_text: string;
    }>>`
      SELECT id, version_number, content_text
      FROM plan_versions
      WHERE doc_id = ${input.docId}
        AND status = 'accepted'
      ORDER BY version_number DESC
      LIMIT 1
    `;
    const previousVersion = previousVersions[0] || null;

    const previousRequirements = previousVersion
      ? await sql<Array<{
          id: string;
          stable_key: string;
          title: string;
          description: string;
          acceptance_criteria: string[];
          status: string;
        }>>`
          SELECT id, stable_key, title, description, acceptance_criteria, status
          FROM requirements
          WHERE plan_version_id = ${previousVersion.id}
          ORDER BY stable_key
        `
      : [];

    const linkedTasks = previousVersion
      ? await sql<Array<{
          requirement_key: string;
          task_id: string;
          title: string;
          description: string | null;
          priority: string;
          status: string;
        }>>`
          SELECT
            r.stable_key AS requirement_key,
            t.id AS task_id,
            t.title,
            t.description,
            t.priority::text AS priority,
            t.status::text AS status
          FROM requirement_task_links rtl
          INNER JOIN requirements r ON r.id = rtl.requirement_id
          INNER JOIN tasks t ON t.id = rtl.task_id
          WHERE r.plan_version_id = ${previousVersion.id}
            AND t.is_archived = 0
          ORDER BY r.stable_key, t.position, t.created_at
        `
      : [];

    const contentText = textFromDocumentContent(doc.content);
    if (!contentText) throw new Error("Plan document has no analyzable content");

    const outputLanguage = detectPlanOutputLanguage(`${doc.title}\n${contentText}`);
    const outputLanguageName = planLanguageName(outputLanguage);
    const copy = planCopy(outputLanguage);

    const systemPrompt = `You are Nexus Plan Impact Analyst.
Compare the current project plan with the accepted baseline and return strict JSON.
User-facing output language: ${outputLanguageName}.
All values shown to users MUST be written in ${outputLanguageName}: summary, requirement title, requirement description, acceptanceCriteria, proposal title, proposal description, and proposal rationale.
Do not translate JSON field names, stable requirement keys, enum values, task ids, or existing task ids.
Keep stable requirement keys when the meaning is the same. Assign new requirements no key or a new REQ-NNN key.
Classify each current requirement as added, modified, or unchanged.
List removed requirements by returning them with changeType "removed".
Create task proposals only when work must change. Never claim that a task was changed.
Allowed proposal actions: create_task, update_task, archive_task, relink_task.
Every requirement needs a concise title, concrete description, and measurable acceptanceCriteria.
Return:
{
  "summary": "short impact summary in ${outputLanguageName}",
  "requirements": [{
    "stableKey": "REQ-001 or empty for new",
    "previousStableKey": "REQ-001 when matched",
    "title": "${outputLanguageName} requirement title",
    "description": "${outputLanguageName} requirement description",
    "acceptanceCriteria": ["${outputLanguageName} acceptance criterion"],
    "changeType": "added|modified|unchanged|removed",
    "confidence": 0-100
  }],
  "proposals": [{
    "action": "create_task|update_task|archive_task|relink_task",
    "requirementStableKey": "REQ-001",
    "taskId": "existing task id when applicable",
    "title": "${outputLanguageName} proposal title",
    "description": "${outputLanguageName} proposal description",
    "priority": "low|medium|high|urgent",
    "rationale": "${outputLanguageName} rationale",
    "confidence": 0-100
  }]
}`;

    const raw = asRecord(await callGeminiJson(
      systemPrompt,
      JSON.stringify({
        currentPlan: {
          title: doc.title,
          content: contentText,
        },
        outputLanguage: outputLanguageName,
        acceptedBaseline: previousVersion
          ? {
              version: previousVersion.version_number,
              content: previousVersion.content_text,
              requirements: previousRequirements,
              linkedTasks,
            }
          : null,
      })
    ));

    const existingByKey = new Map(previousRequirements.map((item) => [item.stable_key, item]));
    let nextKeyNumber = previousRequirements.reduce((max, item) => {
      const number = Number(item.stable_key.replace(/^REQ-/, ""));
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0) + 1;
    const usedKeys = new Set<string>();

    const rawRequirements = Array.isArray(raw.requirements) ? raw.requirements : [];
    const normalizedRequirements: PlanRequirementAnalysis[] = [];

    for (const item of rawRequirements.slice(0, 100)) {
      const record = asRecord(item);
      const previousKey =
        normalizeStableKey(record.previousStableKey) ||
        normalizeStableKey(record.stableKey);
      const previous = previousKey ? existingByKey.get(previousKey) : undefined;
      const rawChangeType = typeof record.changeType === "string"
        ? record.changeType.toLowerCase()
        : previous
          ? "modified"
          : "added";
      const changeType = ["added", "modified", "unchanged", "removed"].includes(rawChangeType)
        ? rawChangeType as PlanRequirementAnalysis["changeType"]
        : previous
          ? "modified"
          : "added";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!title && !previous) continue;

      let stableKey = previous?.stable_key || normalizeStableKey(record.stableKey);
      if (!stableKey || usedKeys.has(stableKey)) {
        do {
          stableKey = `REQ-${String(nextKeyNumber++).padStart(3, "0")}`;
        } while (usedKeys.has(stableKey));
      }
      usedKeys.add(stableKey);

      normalizedRequirements.push({
        stableKey,
        previousStableKey: previous?.stable_key,
        title: (title || previous?.title || stableKey).slice(0, 500),
        description:
          typeof record.description === "string" && record.description.trim()
            ? record.description.trim()
            : previous?.description || title,
        acceptanceCriteria: Array.isArray(record.acceptanceCriteria)
          ? record.acceptanceCriteria
              .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
              .slice(0, 12)
          : previous?.acceptance_criteria || [],
        changeType,
        confidence: clampConfidence(record.confidence),
      });
    }

    for (const previous of previousRequirements) {
      if (usedKeys.has(previous.stable_key)) continue;
      normalizedRequirements.push({
        stableKey: previous.stable_key,
        previousStableKey: previous.stable_key,
        title: previous.title,
        description: previous.description,
        acceptanceCriteria: previous.acceptance_criteria || [],
        changeType: "removed",
        confidence: 100,
      });
      usedKeys.add(previous.stable_key);
    }

    if (normalizedRequirements.length === 0) {
      throw new Error("AI did not extract any reliable requirements");
    }

    const taskById = new Map(linkedTasks.map((task) => [task.task_id, task]));
    const normalizedProposals: PlanProposalAnalysis[] = [];
    const rawProposals = Array.isArray(raw.proposals) ? raw.proposals : [];
    for (const item of rawProposals.slice(0, 100)) {
      const record = asRecord(item);
      const action = typeof record.action === "string" ? record.action : "";
      if (!["create_task", "update_task", "archive_task", "relink_task"].includes(action)) continue;
      const requirementStableKey = normalizeStableKey(record.requirementStableKey) || undefined;
      if (requirementStableKey && !usedKeys.has(requirementStableKey)) continue;
      const taskId = typeof record.taskId === "string" && taskById.has(record.taskId)
        ? record.taskId
        : undefined;
      if (action !== "create_task" && !taskId) continue;
      const title = typeof record.title === "string" && record.title.trim()
        ? record.title.trim().slice(0, 500)
        : taskId
          ? taskById.get(taskId)?.title || copy.updateLinkedTask
          : copy.createLinkedTask;

      normalizedProposals.push({
        action: action as PlanProposalAnalysis["action"],
        requirementStableKey,
        taskId,
        title,
        description: typeof record.description === "string" ? record.description.trim() : undefined,
        priority: normalizePriority(record.priority),
        rationale: typeof record.rationale === "string" && record.rationale.trim()
          ? record.rationale.trim()
          : copy.alignedRationale,
        confidence: clampConfidence(record.confidence),
      });
    }

    const proposalKeys = new Set(
      normalizedProposals.map((proposal) => `${proposal.action}:${proposal.requirementStableKey || ""}:${proposal.taskId || ""}`)
    );
    for (const requirement of normalizedRequirements) {
      const relatedTasks = linkedTasks.filter(
        (task) => task.requirement_key === (requirement.previousStableKey || requirement.stableKey)
      );

      if (requirement.changeType === "added" && !proposalKeys.has(`create_task:${requirement.stableKey}:`)) {
        normalizedProposals.push({
          action: "create_task",
          requirementStableKey: requirement.stableKey,
          title: requirement.title,
          description: requirement.description,
          priority: "medium",
          rationale: copy.addedNoWork(requirement.stableKey),
          confidence: requirement.confidence,
        });
      }

      if (requirement.changeType === "modified") {
        if (relatedTasks.length === 0) {
          normalizedProposals.push({
            action: "create_task",
            requirementStableKey: requirement.stableKey,
            title: requirement.title,
            description: requirement.description,
            priority: "medium",
            rationale: copy.changedNoTask(requirement.stableKey),
            confidence: requirement.confidence,
          });
        } else {
          for (const task of relatedTasks) {
            const key = `update_task:${requirement.stableKey}:${task.task_id}`;
            if (proposalKeys.has(key)) continue;
            normalizedProposals.push({
              action: "update_task",
              requirementStableKey: requirement.stableKey,
              taskId: task.task_id,
              title: task.title,
              description: requirement.description,
              priority: normalizePriority(task.priority),
              rationale: copy.changedAfterTask(requirement.stableKey),
              confidence: requirement.confidence,
            });
          }
        }
      }

      if (requirement.changeType === "removed") {
        for (const task of relatedTasks) {
          const key = `archive_task:${requirement.stableKey}:${task.task_id}`;
          if (proposalKeys.has(key)) continue;
          normalizedProposals.push({
            action: "archive_task",
            requirementStableKey: requirement.stableKey,
            taskId: task.task_id,
            title: task.title,
            description: task.description || undefined,
            priority: normalizePriority(task.priority),
            rationale: copy.removedFromPlan(requirement.stableKey),
            confidence: requirement.confidence,
          });
        }
      }
    }

    const summary = typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : previousVersion
        ? copy.comparedSummary
        : copy.initialSummary;

    return {
      docId: doc.id,
      workspaceId: doc.workspace_id,
      userId: input.userId,
      title: doc.title,
      content: doc.content,
      contentText,
      baseVersionId: previousVersion?.id || null,
      nextVersionNumber: (previousVersion?.version_number || 0) + 1,
      summary,
      requirements: normalizedRequirements,
      proposals: normalizedProposals,
      steps: [{
        agentName: "plan_impact",
        input: copy.stepInput(doc.title),
        output: summary,
        success: true,
        duration: Date.now() - startedAt,
        tokensUsed: Math.round((contentText.length + JSON.stringify(raw).length) / 4),
      }],
    };
  } finally {
    await sql.end();
  }
}

export async function persistPlanImpact(
  analysis: PlanAnalysis,
  temporalWorkflowId: string
): Promise<{
  changeSetId: string;
  versionNumber: number;
  summary: string;
  stats: Record<string, number>;
  steps: AgentStepResult[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    return await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      const versionRows = await tx<Array<{ id: string }>>`
        INSERT INTO plan_versions (
          workspace_id, doc_id, version_number, title, content, content_text,
          status, base_version_id, created_by
        )
        VALUES (
          ${analysis.workspaceId},
          ${analysis.docId},
          ${analysis.nextVersionNumber},
          ${analysis.title},
          ${JSON.stringify(analysis.content)}::jsonb,
          ${analysis.contentText},
          ${"proposed"},
          ${analysis.baseVersionId},
          ${analysis.userId}
        )
        RETURNING id
      `;
      const proposedVersionId = versionRows[0]?.id;
      if (!proposedVersionId) throw new Error("Plan version insert failed");

      const previousRequirementRows = analysis.baseVersionId
        ? await tx<Array<{ id: string; stable_key: string }>>`
            SELECT id, stable_key
            FROM requirements
            WHERE plan_version_id = ${analysis.baseVersionId}
          `
        : [];
      const previousRequirementByKey = new Map(
        previousRequirementRows.map((row) => [row.stable_key, row.id])
      );

      const requirementIdByKey = new Map<string, string>();
      for (const requirement of analysis.requirements) {
        const rows = await tx<Array<{ id: string }>>`
          INSERT INTO requirements (
            workspace_id, doc_id, plan_version_id, stable_key, title, description,
            acceptance_criteria, status, change_type, confidence, previous_requirement_id
          )
          VALUES (
            ${analysis.workspaceId},
            ${analysis.docId},
            ${proposedVersionId},
            ${requirement.stableKey},
            ${requirement.title},
            ${requirement.description},
            ${JSON.stringify(requirement.acceptanceCriteria)}::jsonb,
            ${requirement.changeType === "removed" ? "removed" : "active"},
            ${requirement.changeType},
            ${requirement.confidence},
            ${previousRequirementByKey.get(requirement.previousStableKey || requirement.stableKey) || null}
          )
          RETURNING id
        `;
        const requirementId = rows[0]?.id;
        if (!requirementId) throw new Error(`Requirement insert failed: ${requirement.stableKey}`);
        requirementIdByKey.set(requirement.stableKey, requirementId);

        const previousRequirementId = previousRequirementByKey.get(
          requirement.previousStableKey || requirement.stableKey
        );
        if (previousRequirementId && requirement.changeType !== "removed") {
          await tx`
            INSERT INTO requirement_task_links (
              workspace_id, requirement_id, task_id, created_by
            )
            SELECT
              ${analysis.workspaceId},
              ${requirementId},
              task_id,
              ${analysis.userId}
            FROM requirement_task_links
            WHERE requirement_id = ${previousRequirementId}
            ON CONFLICT (requirement_id, task_id) DO NOTHING
          `;
        }
      }

      await tx`
        INSERT INTO requirement_external_links (
          workspace_id, requirement_id, external_issue_id, confidence, source, created_by
        )
        SELECT DISTINCT
          rtl.workspace_id,
          rtl.requirement_id,
          ei.id,
          85,
          ${"sync"},
          ${analysis.userId}
        FROM requirement_task_links rtl
        INNER JOIN external_issues ei
          ON ei.task_id = rtl.task_id
          AND ei.workspace_id = rtl.workspace_id
        INNER JOIN requirements r
          ON r.id = rtl.requirement_id
        WHERE rtl.workspace_id = ${analysis.workspaceId}
          AND r.plan_version_id = ${proposedVersionId}
        ON CONFLICT (requirement_id, external_issue_id) DO NOTHING
      `;

      const externalIssueLinks = await tx<Array<{
        requirement_id: string;
        stable_key: string;
        change_type: string;
        title: string;
        provider: string;
        integration_id: string | null;
        external_id: string;
        external_key: string | null;
        external_title: string;
      }>>`
        SELECT
          r.id AS requirement_id,
          r.stable_key,
          r.change_type,
          r.title,
          ei.provider,
          ei.integration_id,
          ei.external_id,
          ei.external_key,
          ei.title AS external_title
        FROM requirement_external_links rel
        INNER JOIN requirements r ON r.id = rel.requirement_id
        INNER JOIN external_issues ei ON ei.id = rel.external_issue_id
        WHERE r.workspace_id = ${analysis.workspaceId}
          AND r.plan_version_id = ${proposedVersionId}
          AND r.change_type IN ('added', 'modified', 'removed')
          AND ei.provider IN ('linear', 'github')
      `;

      const connectedIntegrations = await tx<Array<{
        id: string;
        provider: string;
        metadata: Record<string, unknown> | null;
      }>>`
        SELECT id, provider, metadata
        FROM workspace_integrations
        WHERE workspace_id = ${analysis.workspaceId}::uuid
          AND provider IN ('github', 'linear')
          AND status IN ('connected', 'needs_config')
        ORDER BY updated_at DESC
      `;

      const localizedForTurkish = detectPlanOutputLanguage(`${analysis.title}\n${analysis.contentText}`) === "tr";
      const externalProposals: PlanProposalAnalysis[] = [];
      for (const link of externalIssueLinks) {
        const operationTitle = localizedForTurkish
          ? `${link.provider === "linear" ? "Linear" : "GitHub"} işine plan değişikliği yorumu ekle`
          : `Add plan change comment to ${link.provider === "linear" ? "Linear" : "GitHub"} work`;
        const operationRationale = localizedForTurkish
          ? `${link.stable_key} gereksinimi ${link.change_type} olarak işaretlendi; bağlı dış işte iz bırakılmalı.`
          : `${link.stable_key} was marked as ${link.change_type}; the linked external work needs an audit trail.`;
        const body = localizedForTurkish
          ? `Nexus plan etki analizi: ${link.stable_key} (${link.title}) gereksinimi ${link.change_type} olarak işaretlendi. Lütfen bağlı işi bu plan değişikliğine göre gözden geçirin.`
          : `Nexus plan impact analysis: requirement ${link.stable_key} (${link.title}) was marked as ${link.change_type}. Please review this linked work against the plan change.`;

        if (link.provider === "linear") {
          externalProposals.push({
            action: "linear_comment",
            requirementStableKey: link.stable_key,
            title: operationTitle,
            description: body,
            rationale: operationRationale,
            confidence: 85,
            metadata: {
              externalProvider: "linear",
              integrationId: link.integration_id,
              payload: {
                issueId: link.external_id,
                body,
              },
            },
          });
        }

        if (link.provider === "github") {
          const issueNumber = Number((link.external_key || "").replace("#", ""));
          if (Number.isInteger(issueNumber) && issueNumber > 0) {
            externalProposals.push({
              action: "github_issue_comment",
              requirementStableKey: link.stable_key,
              title: operationTitle,
              description: body,
              rationale: operationRationale,
              confidence: 85,
              metadata: {
                externalProvider: "github",
                integrationId: link.integration_id,
                payload: {
                  issueNumber,
                  body,
                },
              },
            });
          }
        }
      }

      const linkedProviderKeys = new Set(
        externalIssueLinks.map((link) => `${link.provider}:${link.stable_key}`)
      );
      for (const requirement of analysis.requirements) {
        if (requirement.changeType !== "added") continue;

        for (const integration of connectedIntegrations) {
          if (linkedProviderKeys.has(`${integration.provider}:${requirement.stableKey}`)) continue;
          const metadata = integration.metadata || {};
          const body = [
            `${requirement.stableKey}: ${requirement.title}`,
            "",
            requirement.description,
            requirement.acceptanceCriteria.length > 0
              ? `\nAcceptance criteria:\n${requirement.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`
              : "",
            "",
            `<!-- nexus-requirement:${requirement.stableKey} -->`,
          ].filter(Boolean).join("\n");

          if (integration.provider === "github") {
            externalProposals.push({
              action: "github_create_issue",
              requirementStableKey: requirement.stableKey,
              title: localizedForTurkish
                ? `${requirement.stableKey} için GitHub issue oluştur`
                : `Create GitHub issue for ${requirement.stableKey}`,
              description: body,
              rationale: localizedForTurkish
                ? "Yeni gereksinimin GitHub teslimat zincirinde izlenebilmesi için issue önerildi."
                : "Create a GitHub issue so the new requirement is traceable through delivery.",
              confidence: requirement.confidence,
              metadata: {
                externalProvider: "github",
                integrationId: integration.id,
                payload: {
                  title: `${requirement.stableKey}: ${requirement.title}`,
                  body,
                  labels: ["nexus-change"],
                },
              },
            });
          }

          const teamId = typeof metadata.selectedTeamId === "string"
            ? metadata.selectedTeamId
            : null;
          if (integration.provider === "linear" && teamId) {
            externalProposals.push({
              action: "linear_create_issue",
              requirementStableKey: requirement.stableKey,
              title: localizedForTurkish
                ? `${requirement.stableKey} için Linear issue oluştur`
                : `Create Linear issue for ${requirement.stableKey}`,
              description: body,
              rationale: localizedForTurkish
                ? "Yeni gereksinimin Linear teslimat zincirinde izlenebilmesi için issue önerildi."
                : "Create a Linear issue so the new requirement is traceable through delivery.",
              confidence: requirement.confidence,
              metadata: {
                externalProvider: "linear",
                integrationId: integration.id,
                payload: {
                  teamId,
                  projectId: typeof metadata.selectedProjectId === "string"
                    ? metadata.selectedProjectId
                    : undefined,
                  title: `${requirement.stableKey}: ${requirement.title}`,
                  description: body,
                },
              },
            });
          }
        }
      }

      const allProposals = [...analysis.proposals, ...externalProposals];

      const stats = {
        added: analysis.requirements.filter((item) => item.changeType === "added").length,
        modified: analysis.requirements.filter((item) => item.changeType === "modified").length,
        unchanged: analysis.requirements.filter((item) => item.changeType === "unchanged").length,
        removed: analysis.requirements.filter((item) => item.changeType === "removed").length,
        proposals: allProposals.length,
      };

      const changeSetRows = await tx<Array<{ id: string }>>`
        INSERT INTO change_sets (
          workspace_id, doc_id, base_version_id, proposed_version_id,
          temporal_workflow_id, status, summary, stats, created_by
        )
        VALUES (
          ${analysis.workspaceId},
          ${analysis.docId},
          ${analysis.baseVersionId},
          ${proposedVersionId},
          ${temporalWorkflowId},
          ${"pending"},
          ${analysis.summary},
          ${JSON.stringify(stats)}::jsonb,
          ${analysis.userId}
        )
        RETURNING id
      `;
      const changeSetId = changeSetRows[0]?.id;
      if (!changeSetId) throw new Error("Change set insert failed");

      for (const proposal of allProposals) {
        await tx`
          INSERT INTO change_proposals (
            change_set_id, workspace_id, requirement_id, task_id, action,
            title, description, priority, rationale, confidence, status, metadata
          )
          VALUES (
            ${changeSetId},
            ${analysis.workspaceId},
            ${proposal.requirementStableKey
              ? requirementIdByKey.get(proposal.requirementStableKey) || null
              : null},
            ${proposal.taskId || null},
            ${proposal.action},
            ${proposal.title},
            ${proposal.description || null},
            ${proposal.priority || null},
            ${proposal.rationale},
            ${proposal.confidence},
            ${"pending"},
            ${JSON.stringify({
              requirementStableKey: proposal.requirementStableKey,
              ...(proposal.metadata || {}),
            })}::jsonb
          )
        `;

        if (proposal.taskId) {
          await tx`
            UPDATE tasks
            SET alignment_status = 'needs_review',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${proposal.taskId}
              AND workspace_id = ${analysis.workspaceId}
          `;
        }
      }

      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${analysis.userId},
          ${analysis.workspaceId},
          ${"plan.change_proposed"},
          ${"success"},
          ${JSON.stringify({
            docId: analysis.docId,
            changeSetId,
            versionNumber: analysis.nextVersionNumber,
            stats,
          })}::jsonb
        )
      `;

      return {
        changeSetId,
        versionNumber: analysis.nextVersionNumber,
        summary: analysis.summary,
        stats,
        steps: analysis.steps,
      };
    });
  } finally {
    await sql.end();
  }
}

export async function applyPlanChangeSet(
  changeSetId: string,
  selectedProposalIds: string[],
  userId: string
): Promise<{
  applied: number;
  rejected: number;
  createdTaskIds: string[];
  externalOperationIds: string[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const selectedProposalIdSet = new Set(
    selectedProposalIds.filter((value) => value.trim().length > 0)
  );

  if (selectedProposalIdSet.size === 0) {
    throw new Error("No change proposals selected");
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    return await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      const changeSetRows = await tx<Array<{
        id: string;
        workspace_id: string;
        doc_id: string;
        proposed_version_id: string;
        status: string;
      }>>`
        SELECT id, workspace_id, doc_id, proposed_version_id, status
        FROM change_sets
        WHERE id = ${changeSetId}
        FOR UPDATE
      `;
      const changeSet = changeSetRows[0];
      if (!changeSet) throw new Error("Change set not found");
      if (changeSet.status !== "pending") throw new Error("Change set is already resolved");

      const proposals = await tx<Array<{
        id: string;
        requirement_id: string | null;
        task_id: string | null;
        action: PlanProposalAnalysis["action"];
        title: string;
        description: string | null;
        priority: string | null;
        rationale: string;
        metadata: Record<string, unknown> | null;
      }>>`
        SELECT id, requirement_id, task_id, action, title, description, priority, rationale, metadata
        FROM change_proposals
        WHERE change_set_id = ${changeSetId}
          AND status = 'pending'
        ORDER BY created_at, id
      `;

      const pendingProposalIds = new Set(proposals.map((proposal) => proposal.id));
      const unknownSelectedIds = [...selectedProposalIdSet].filter((id) => !pendingProposalIds.has(id));
      if (unknownSelectedIds.length > 0) {
        throw new Error("Selected proposal does not belong to this pending change set");
      }
      const selectedCreateTaskCount = proposals.filter(
        (proposal) => selectedProposalIdSet.has(proposal.id) && proposal.action === "create_task"
      ).length;

      const selected = selectedProposalIdSet;
      const createdTaskIds: string[] = [];
      const externalOperationIds: string[] = [];
      const externalActions = new Set([
        "linear_create_issue",
        "linear_update_issue",
        "linear_comment",
        "github_create_issue",
        "github_issue_comment",
        "github_issue_update",
        "github_issue_label",
        "mark_agent_job_outdated",
      ]);
      let applied = 0;
      let rejected = 0;
      let externalQueued = 0;

      for (const proposal of proposals) {
        if (!selected.has(proposal.id)) {
          await tx`
            UPDATE change_proposals SET status = 'rejected'
            WHERE id = ${proposal.id}
          `;
          rejected++;
          continue;
        }

        if (externalActions.has(proposal.action)) {
          const metadata = proposal.metadata || {};
          const provider =
            typeof metadata.externalProvider === "string"
              ? metadata.externalProvider
              : proposal.action.startsWith("github_")
                ? "github"
                : proposal.action.startsWith("linear_")
                  ? "linear"
                  : "agent";
          const payload =
            metadata.payload && typeof metadata.payload === "object"
              ? metadata.payload
              : {};

          if (provider === "agent") {
            await tx`
              UPDATE agent_jobs
              SET status = 'outdated', updated_at = now()
              WHERE workspace_id = ${changeSet.workspace_id}::uuid
                AND status IN ('queued', 'claimed', 'running', 'submitted')
                AND task_id = ${proposal.task_id}::uuid
            `;
            await tx`
              UPDATE change_proposals
              SET status = 'applied', applied_at = now()
              WHERE id = ${proposal.id}
            `;
            applied++;
            continue;
          }

          const integrationRows = await tx<Array<{ id: string }>>`
            SELECT id
            FROM workspace_integrations
            WHERE workspace_id = ${changeSet.workspace_id}::uuid
              AND provider = ${provider}
            ORDER BY updated_at DESC
            LIMIT 1
          `;
          const integrationId =
            typeof metadata.integrationId === "string"
              ? metadata.integrationId
              : integrationRows[0]?.id || null;
          if (!integrationId) {
            throw new Error(`No ${provider} integration is available for external proposal ${proposal.id}`);
          }

          const operationRows = await tx<Array<{ id: string }>>`
            INSERT INTO external_write_operations (
              workspace_id,
              change_set_id,
              change_proposal_id,
              integration_id,
              provider,
              operation_type,
              payload,
              status,
              idempotency_key,
              created_by
            )
            VALUES (
              ${changeSet.workspace_id}::uuid,
              ${changeSetId}::uuid,
              ${proposal.id}::uuid,
              ${integrationId}::uuid,
              ${provider},
              ${proposal.action},
              ${JSON.stringify(payload)}::jsonb,
              ${"pending"},
              ${`${changeSetId}:${proposal.id}:${proposal.action}`},
              ${userId}
            )
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id
          `;
          if (operationRows[0]?.id) {
            externalOperationIds.push(operationRows[0].id);
          } else {
            const existingRows = await tx<Array<{ id: string }>>`
              SELECT id FROM external_write_operations
              WHERE idempotency_key = ${`${changeSetId}:${proposal.id}:${proposal.action}`}
              LIMIT 1
            `;
            if (existingRows[0]?.id) externalOperationIds.push(existingRows[0].id);
          }
          await tx`
            UPDATE change_proposals
            SET status = 'pending_external'
            WHERE id = ${proposal.id}
          `;
          await tx`
            INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
            VALUES (
              ${userId},
              ${changeSet.workspace_id}::uuid,
              ${`plan.${proposal.action}.queued`},
              ${"success"},
              ${JSON.stringify({
                changeSetId,
                proposalId: proposal.id,
                provider,
              })}::jsonb
            )
          `;
          externalQueued++;
          continue;
        }

        let taskId = proposal.task_id;
        const priority = normalizePriority(proposal.priority);
        const hasPriority = typeof proposal.priority === "string" && proposal.priority.trim().length > 0;

        if (proposal.action === "create_task") {
          const rows = await tx<Array<{ id: string }>>`
            INSERT INTO tasks (
              workspace_id, doc_id, title, description, status, priority,
              position, is_archived, alignment_status, alignment_updated_at,
              created_by, assignee_id
            )
            VALUES (
              ${changeSet.workspace_id}::uuid,
              ${changeSet.doc_id}::uuid,
              ${proposal.title},
              ${proposal.description || ""},
              ${"todo"},
              ${priority},
              ${0},
              ${0},
              ${"aligned"},
              now(),
              ${userId},
              ${userId}
            )
            RETURNING id
          `;
          taskId = rows[0]?.id || null;
          if (!taskId) throw new Error("Task insert failed");
          createdTaskIds.push(taskId);
        } else if (proposal.action === "update_task" && taskId) {
          await tx`
            UPDATE tasks
            SET title = CASE
                  WHEN ${proposal.title.trim()} <> '' THEN ${proposal.title}
                  ELSE title
                END,
                description = COALESCE(${proposal.description}, description),
                priority = CASE
                  WHEN ${hasPriority} THEN ${priority}::task_priority
                  ELSE priority
                END,
                is_archived = 0,
                alignment_status = 'aligned',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${taskId}::uuid
              AND workspace_id = ${changeSet.workspace_id}::uuid
          `;
        } else if (proposal.action === "archive_task" && taskId) {
          await tx`
            UPDATE tasks
            SET is_archived = 1,
                alignment_status = 'aligned',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${taskId}::uuid
              AND workspace_id = ${changeSet.workspace_id}::uuid
          `;
        } else if (proposal.action === "relink_task" && taskId && proposal.requirement_id) {
          await tx`
            DELETE FROM requirement_task_links rtl
            USING requirements r
            WHERE rtl.requirement_id = r.id
              AND rtl.task_id = ${taskId}::uuid
              AND r.plan_version_id = ${changeSet.proposed_version_id}::uuid
              AND rtl.requirement_id <> ${proposal.requirement_id}::uuid
          `;
        } else {
          throw new Error(`Proposal ${proposal.id} cannot be applied without a target task`);
        }

        if (proposal.requirement_id && taskId && proposal.action !== "archive_task") {
          await tx`
            INSERT INTO requirement_task_links (
              workspace_id, requirement_id, task_id, created_by
            )
            VALUES (
              ${changeSet.workspace_id}::uuid,
              ${proposal.requirement_id}::uuid,
              ${taskId}::uuid,
              ${userId}
            )
            ON CONFLICT (requirement_id, task_id) DO NOTHING
          `;
          await tx`
            UPDATE tasks
            SET doc_id = ${changeSet.doc_id}::uuid,
                alignment_status = 'aligned',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${taskId}::uuid
          `;
          await tx`
            INSERT INTO requirement_external_links (
              workspace_id, requirement_id, external_issue_id, confidence, source, created_by
            )
            SELECT DISTINCT
              ${changeSet.workspace_id}::uuid,
              ${proposal.requirement_id}::uuid,
              ei.id,
              85,
              ${"sync"},
              ${userId}
            FROM external_issues ei
            WHERE ei.workspace_id = ${changeSet.workspace_id}::uuid
              AND ei.task_id = ${taskId}::uuid
            ON CONFLICT (requirement_id, external_issue_id) DO NOTHING
          `;
        }

        await tx`
          UPDATE change_proposals
          SET status = 'applied', applied_at = now(), task_id = ${taskId}::uuid
          WHERE id = ${proposal.id}
        `;
        await tx`
          INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
          VALUES (
            ${userId},
            ${changeSet.workspace_id}::uuid,
            ${`plan.${proposal.action}`},
            ${"success"},
            ${JSON.stringify({
              changeSetId,
              proposalId: proposal.id,
              taskId,
              rationale: proposal.rationale,
            })}::jsonb
          )
        `;
        applied++;
      }

      if (selectedCreateTaskCount > 0 && createdTaskIds.length !== selectedCreateTaskCount) {
        await tx`
          INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
          VALUES (
            ${userId},
            ${changeSet.workspace_id}::uuid,
            ${"plan.change_apply_incomplete"},
            ${"error"},
            ${JSON.stringify({
              changeSetId,
              expectedCreatedTasks: selectedCreateTaskCount,
              createdTaskIds,
            })}::jsonb
          )
        `;
        throw new Error(
          `Expected ${selectedCreateTaskCount} created tasks but only created ${createdTaskIds.length}`
        );
      }

      await tx`
        UPDATE plan_versions
        SET status = 'superseded'
        WHERE doc_id = ${changeSet.doc_id}::uuid
          AND status = 'accepted'
      `;
      await tx`
        UPDATE plan_versions
        SET status = 'accepted'
        WHERE id = ${changeSet.proposed_version_id}::uuid
      `;
      const finalChangeSetStatus =
        externalQueued > 0
          ? "external_pending"
          : rejected > 0
            ? "partially_applied"
            : "applied";

      await tx`
        UPDATE change_sets
        SET status = ${finalChangeSetStatus},
            resolved_by = ${userId},
            resolved_at = now(),
            updated_at = now()
        WHERE id = ${changeSetId}
      `;
      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${userId},
          ${changeSet.workspace_id}::uuid,
          ${"plan.change_applied"},
              ${"success"},
              ${JSON.stringify({
                changeSetId,
                applied,
                rejected,
                externalQueued,
                createdTaskIds,
                status: finalChangeSetStatus,
              })}::jsonb
            )
          `;

      const outdatedJobs = await tx<Array<{ id: string }>>`
        UPDATE agent_jobs
        SET status = 'outdated', updated_at = now()
        WHERE workspace_id = ${changeSet.workspace_id}::uuid
          AND status IN ('queued', 'claimed', 'running', 'submitted')
          AND task_id IN (
            SELECT id FROM tasks WHERE doc_id = ${changeSet.doc_id}::uuid
          )
        RETURNING id
      `;
      for (const job of outdatedJobs) {
        await tx`
          INSERT INTO agent_job_events (job_id, workspace_id, type, message, metadata)
          VALUES (
            ${job.id},
            ${changeSet.workspace_id}::uuid,
            ${"outdated"},
            ${"The approved plan changed. Refresh the agent brief before review."},
            ${JSON.stringify({ changeSetId })}::jsonb
          )
        `;
      }

      return { applied, rejected, createdTaskIds, externalOperationIds };
    });
  } finally {
    await sql.end();
  }
}

type ExternalOperationRow = {
  id: string;
  workspace_id: string;
  change_set_id: string;
  change_proposal_id: string;
  integration_id: string;
  provider: string;
  operation_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  idempotency_key: string;
  created_by: string | null;
  installation_id: string | null;
  token_ciphertext: string | null;
  integration_metadata: Record<string, unknown> | null;
  requirement_id: string | null;
};

type ProviderHttpError = Error & { status?: number; body?: unknown };

function integrationEncryptionKey() {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY is invalid");
  return key;
}

function decryptIntegrationToken<T>(encrypted: string): T {
  const [version, ivRaw, tagRaw, ciphertextRaw] = encrypted.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Unsupported integration token ciphertext format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    integrationEncryptionKey(),
    Buffer.from(ivRaw, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function encryptIntegrationToken(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createGitHubWorkerJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !rawKey) throw new Error("GitHub App worker environment is incomplete");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`;
}

async function providerFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(`Provider API failed: ${response.status}`) as ProviderHttpError;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body as T;
}

async function githubInstallationToken(installationId: string) {
  const response = await providerFetch<{ token: string }>(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    createGitHubWorkerJwt(),
    { method: "POST" }
  );
  return response.token;
}

function selectedGitHubRepository(metadata: Record<string, unknown>) {
  const selected = typeof metadata.selectedRepository === "string"
    ? metadata.selectedRepository
    : null;
  if (selected?.includes("/")) {
    const [owner, repo] = selected.split("/");
    if (owner && repo) return { owner, repo };
  }
  const owner = typeof metadata.repositoryOwner === "string" ? metadata.repositoryOwner : null;
  const repo = typeof metadata.repositoryName === "string" ? metadata.repositoryName : null;
  if (!owner || !repo) throw new Error("Select a GitHub repository before applying writes");
  return { owner, repo };
}

type GitHubSyncOperationRow = {
  id: string;
  workspace_id: string;
  integration_id: string;
  provider: string;
  status: string;
  installation_id: string | null;
  integration_metadata: Record<string, unknown> | null;
  created_by: string | null;
};

type GitHubSyncRepository = {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  owner?: { login?: string };
  name: string;
};

type GitHubSyncIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels?: Array<string | { name?: string }>;
  pull_request?: unknown;
  updated_at?: string;
};

type GitHubSyncPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
  merged_at?: string | null;
};

type GitHubSyncFile = { filename?: string };

type GitHubSyncCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  details_url?: string;
  started_at?: string | null;
  completed_at?: string | null;
};

type GitHubSyncedPullRequest = GitHubSyncPullRequest & {
  changedFiles: string[];
  checkRuns: GitHubSyncCheckRun[];
};

const GITHUB_CLOSING_ISSUE_REFERENCE =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;
const GITHUB_ISSUE_REFERENCE = /(^|[^\w])#(\d+)\b/g;
const GITHUB_REQUIREMENT_REFERENCE = /\bREQ-\d+\b/gi;

function normalizeIntegrationText(value: string | null | undefined) {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGitHubPullRequestReferences(input: {
  title: string;
  body?: string | null;
  branch?: string | null;
}) {
  const text = `${input.title || ""}\n${input.body || ""}`;
  const issueNumbers = new Set<string>();
  const requirementKeys = new Set<string>();

  for (const match of text.matchAll(GITHUB_CLOSING_ISSUE_REFERENCE)) {
    if (match[1]) issueNumbers.add(`#${match[1]}`);
  }
  for (const match of text.matchAll(GITHUB_ISSUE_REFERENCE)) {
    if (match[2]) issueNumbers.add(`#${match[2]}`);
  }
  for (const source of [text, input.branch || ""]) {
    for (const match of source.matchAll(GITHUB_REQUIREMENT_REFERENCE)) {
      requirementKeys.add(match[0].toUpperCase());
    }
  }

  return { issueNumbers: [...issueNumbers], requirementKeys: [...requirementKeys] };
}

function githubIssueLabels(issue: GitHubSyncIssue) {
  return (issue.labels || [])
    .map((label) => {
      if (typeof label === "string") return label;
      return typeof label.name === "string" ? label.name : "";
    })
    .filter(Boolean);
}

function githubIssueReferenceMap(
  issues: Array<{ id: string; external_key: string | null; title: string; description: string | null }>
) {
  const map = new Map<string, string>();
  for (const issue of issues) {
    if (issue.external_key) map.set(issue.external_key.toUpperCase(), issue.id);
    const haystack = `${issue.title}\n${issue.description || ""}`;
    for (const match of haystack.matchAll(GITHUB_REQUIREMENT_REFERENCE)) {
      map.set(match[0].toUpperCase(), issue.id);
    }
  }
  return map;
}

async function fetchGitHubRepositorySyncData(
  token: string,
  owner: string,
  repo: string
) {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const base = `https://api.github.com/repos/${encodedOwner}/${encodedRepo}`;
  const repository = await providerFetch<GitHubSyncRepository>(base, token);
  const rawIssues = await providerFetch<GitHubSyncIssue[]>(
    `${base}/issues?state=all&per_page=100`,
    token
  );
  const issues = rawIssues.filter((issue) => !issue.pull_request);
  const pulls = await providerFetch<GitHubSyncPullRequest[]>(
    `${base}/pulls?state=all&per_page=100`,
    token
  );
  const pullRequests: GitHubSyncedPullRequest[] = [];

  for (const pull of pulls) {
    const files = await providerFetch<GitHubSyncFile[]>(
      `${base}/pulls/${pull.number}/files?per_page=100`,
      token
    );
    let checkRuns: GitHubSyncCheckRun[] = [];
    const sha = pull.head?.sha;
    if (sha) {
      try {
        const checks = await providerFetch<{ check_runs?: GitHubSyncCheckRun[] }>(
          `${base}/commits/${sha}/check-runs?per_page=100`,
          token
        );
        checkRuns = checks.check_runs || [];
      } catch {
        checkRuns = [];
      }
    }
    pullRequests.push({
      ...pull,
      changedFiles: files.map((file) => file.filename || "").filter(Boolean),
      checkRuns,
    });
  }

  return { repository, issues, pullRequests };
}

async function autoLinkGitHubRequirements(sql: SqlExecutor, workspaceId: string) {
  const requirements = await sql<Array<{
    id: string;
    stable_key: string;
    title: string;
  }>>`
    SELECT id, stable_key, title
    FROM requirements
    WHERE workspace_id = ${workspaceId}::uuid
      AND status <> 'removed'
  `;
  const issues = await sql<Array<{
    id: string;
    title: string;
    description: string | null;
    external_key: string | null;
  }>>`
    SELECT id, title, description, external_key
    FROM external_issues
    WHERE workspace_id = ${workspaceId}::uuid
      AND provider = 'github'
  `;

  let linked = 0;
  for (const requirement of requirements) {
    const requirementTitle = normalizeIntegrationText(requirement.title);
    for (const issue of issues) {
      const haystack = `${issue.title}\n${issue.description || ""}`.toUpperCase();
      const normalizedIssue = normalizeIntegrationText(`${issue.title}\n${issue.description || ""}`);
      const stableKeyMatch = haystack.includes(requirement.stable_key.toUpperCase());
      const titleMatch = requirementTitle.length >= 8 && normalizedIssue.includes(requirementTitle);
      if (!stableKeyMatch && !titleMatch) continue;

      const rows = await sql<Array<{ id: string }>>`
        INSERT INTO requirement_external_links (
          workspace_id, requirement_id, external_issue_id, confidence, source, created_by
        ) VALUES (
          ${workspaceId}::uuid,
          ${requirement.id}::uuid,
          ${issue.id}::uuid,
          ${stableKeyMatch ? 95 : 70},
          ${stableKeyMatch ? "sync" : "ai"},
          NULL
        )
        ON CONFLICT (requirement_id, external_issue_id) DO NOTHING
        RETURNING id
      `;
      if (rows[0]?.id) linked += 1;
    }
  }

  return linked;
}

async function recordGitHubSyncFailure(
  sql: SqlExecutor,
  operation: GitHubSyncOperationRow,
  message: string
) {
  await sql`
    INSERT INTO integration_sync_runs (
      workspace_id, integration_id, provider, status, completed_at, error, stats, metadata
    ) VALUES (
      ${operation.workspace_id}::uuid,
      ${operation.integration_id}::uuid,
      ${"github"},
      ${"failed"},
      now(),
      ${message},
      ${JSON.stringify({})}::jsonb,
      ${JSON.stringify({ source: "external_write", operationId: operation.id })}::jsonb
    )
  `;
  await sql`
    UPDATE workspace_integrations
    SET last_error = ${message}, updated_at = now()
    WHERE id = ${operation.integration_id}::uuid
  `;
}

function withNexusMarker(body: string, key: string) {
  const marker = `<!-- nexus-operation:${key} -->`;
  return body.includes(marker) ? body : `${body.trim()}\n\n${marker}`;
}

async function runGitHubExternalWrite(operation: ExternalOperationRow) {
  if (!operation.installation_id) throw new Error("GitHub installation is missing");
  const metadata = operation.integration_metadata || {};
  const { owner, repo } = selectedGitHubRepository(metadata);
  const token = await githubInstallationToken(operation.installation_id);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const payload = operation.payload || {};

  if (operation.operation_type === "github_create_issue") {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) throw new Error("GitHub issue create requires payload.title");
    const body = withNexusMarker(
      typeof payload.body === "string" ? payload.body : "Created from a Nexus plan change.",
      operation.idempotency_key
    );
    const existing = await providerFetch<Array<Record<string, unknown>>>(
      `${base}/issues?state=all&per_page=100`,
      token
    );
    const duplicate = existing.find((issue) =>
      typeof issue.body === "string" && issue.body.includes(`nexus-operation:${operation.idempotency_key}`)
    );
    if (duplicate) return duplicate;
    return providerFetch<Record<string, unknown>>(`${base}/issues`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        labels: Array.isArray(payload.labels) ? payload.labels : undefined,
      }),
    });
  }

  const issueNumber = Number(payload.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("GitHub issue operation requires payload.issueNumber");
  }

  if (operation.operation_type === "github_issue_comment") {
    const rawBody = typeof payload.body === "string" ? payload.body : payload.comment;
    if (typeof rawBody !== "string" || !rawBody.trim()) {
      throw new Error("GitHub issue comment requires payload.body");
    }
    const body = withNexusMarker(rawBody, operation.idempotency_key);
    const comments = await providerFetch<Array<Record<string, unknown>>>(
      `${base}/issues/${issueNumber}/comments?per_page=100`,
      token
    );
    const duplicate = comments.find((comment) =>
      typeof comment.body === "string" && comment.body.includes(`nexus-operation:${operation.idempotency_key}`)
    );
    if (!duplicate) {
      await providerFetch(`${base}/issues/${issueNumber}/comments`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    }
    return providerFetch<Record<string, unknown>>(`${base}/issues/${issueNumber}`, token);
  }

  if (operation.operation_type === "github_issue_update" || operation.operation_type === "github_issue_label") {
    const updatePayload: Record<string, unknown> = {};
    if (typeof payload.title === "string") updatePayload.title = payload.title;
    if (typeof payload.body === "string") updatePayload.body = payload.body;
    if (Array.isArray(payload.labels)) updatePayload.labels = payload.labels;
    if (Object.keys(updatePayload).length === 0) {
      throw new Error("GitHub issue update requires at least one mutable field");
    }
    return providerFetch<Record<string, unknown>>(`${base}/issues/${issueNumber}`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });
  }

  throw new Error(`Unsupported GitHub operation: ${operation.operation_type}`);
}

type LinearTokenPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
};

async function resolveLinearWorkerToken(encrypted: string) {
  const token = decryptIntegrationToken<LinearTokenPayload>(encrypted);
  if (!token.expiresAt || token.expiresAt >= Date.now() + 60_000 || !token.refreshToken) {
    return { accessToken: token.accessToken, encrypted: null as string | null };
  }
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Linear OAuth worker environment is incomplete");
  const response = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    const error = new Error("Linear token refresh failed") as ProviderHttpError;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  const next: LinearTokenPayload = {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : token.refreshToken,
    expiresAt: typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : undefined,
    scope: typeof body.scope === "string" ? body.scope : token.scope,
  };
  return { accessToken: next.accessToken, encrypted: encryptIntegrationToken(next) };
}

async function linearWorkerGraphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || body.errors?.length || !body.data) {
    const error = new Error(body.errors?.[0]?.message || `Linear API failed: ${response.status}`) as ProviderHttpError;
    error.status = response.status || 400;
    error.body = body;
    throw error;
  }
  return body.data;
}

async function runLinearExternalWrite(operation: ExternalOperationRow) {
  if (!operation.token_ciphertext) throw new Error("Linear OAuth token is missing");
  const token = await resolveLinearWorkerToken(operation.token_ciphertext);
  const payload = operation.payload || {};
  let result: unknown;

  if (operation.operation_type === "linear_create_issue") {
    const teamId = typeof payload.teamId === "string" ? payload.teamId : null;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!teamId || !title) throw new Error("Linear create requires payload.teamId and payload.title");
    result = await linearWorkerGraphql(token.accessToken, `mutation NexusIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier title description url priority state { name } labels { nodes { name } } } }
    }`, {
      input: {
        teamId,
        title,
        description: typeof payload.description === "string" ? payload.description : undefined,
        projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
      },
    });
  } else if (operation.operation_type === "linear_update_issue") {
    const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
    if (!issueId) throw new Error("Linear update requires payload.issueId");
    const input: Record<string, unknown> = {};
    if (typeof payload.title === "string") input.title = payload.title;
    if (typeof payload.description === "string") input.description = payload.description;
    if (typeof payload.stateId === "string") input.stateId = payload.stateId;
    result = await linearWorkerGraphql(token.accessToken, `mutation NexusIssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success issue { id identifier title description url priority state { name } labels { nodes { name } } } }
    }`, { id: issueId, input });
  } else if (operation.operation_type === "linear_comment") {
    const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
    const body = typeof payload.body === "string" ? payload.body : payload.comment;
    if (!issueId || typeof body !== "string" || !body.trim()) {
      throw new Error("Linear comment requires payload.issueId and payload.body");
    }
    result = await linearWorkerGraphql(token.accessToken, `mutation NexusComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id url } }
    }`, { issueId, body });
  } else {
    throw new Error(`Unsupported Linear operation: ${operation.operation_type}`);
  }

  return { result, refreshedCiphertext: token.encrypted };
}

export function externalErrorIsRetryable(error: unknown) {
  const status = (error as ProviderHttpError | null)?.status;
  const message = error instanceof Error ? error.message : String(error);

  // Local validation and configuration failures cannot succeed on retry.
  if (
    /installation is missing|requires payload\.|requires payload |OAuth token is missing|unsupported external provider/i.test(
      message
    )
  ) {
    return false;
  }

  return typeof status !== "number" || status === 408 || status === 429 || status >= 500;
}

export function resolveExternalChangeSetStatus(input: {
  succeeded: number;
  failed: number;
  internalApplied: number;
}) {
  if (input.failed === 0) return "applied" as const;
  if (input.succeeded > 0 || input.internalApplied > 0) return "partially_applied" as const;
  return "external_failed" as const;
}

function unwrapLinearIssue(response: unknown) {
  const record = asRecord(response);
  const create = asRecord(record.issueCreate);
  const update = asRecord(record.issueUpdate);
  return asRecord(create.issue || update.issue);
}

type SqlExecutor = <T extends readonly Record<string, unknown>[] = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

async function upsertExternalIssueFromWrite(
  sql: SqlExecutor,
  operation: ExternalOperationRow,
  response: unknown
) {
  const issue = operation.provider === "linear"
    ? unwrapLinearIssue(response)
    : asRecord(response);
  const externalId = issue.id;
  if ((typeof externalId !== "string" && typeof externalId !== "number") || !operation.requirement_id) return;

  const externalKey = operation.provider === "github"
    ? typeof issue.number === "number" ? `#${issue.number}` : null
    : typeof issue.identifier === "string" ? issue.identifier : null;
  const title = typeof issue.title === "string"
    ? issue.title
    : typeof operation.payload?.title === "string"
      ? operation.payload.title
      : externalKey || "External work";
  const description = typeof issue.body === "string"
    ? issue.body
    : typeof issue.description === "string"
      ? issue.description
      : typeof operation.payload?.description === "string"
        ? operation.payload.description
        : null;
  const state = asRecord(issue.state);
  const status = typeof state.name === "string"
    ? state.name
    : typeof issue.state === "string"
      ? issue.state
      : "open";
  const url = typeof issue.html_url === "string"
    ? issue.html_url
    : typeof issue.url === "string"
      ? issue.url
      : null;
  const labelsValue = Array.isArray(issue.labels)
    ? issue.labels.map((label) => typeof label === "string" ? label : String(asRecord(label).name || "")).filter(Boolean)
    : Array.isArray(asRecord(issue.labels).nodes)
      ? (asRecord(issue.labels).nodes as unknown[]).map((label) => String(asRecord(label).name || "")).filter(Boolean)
      : [];

  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO external_issues (
      workspace_id, integration_id, provider, external_id, external_key,
      title, description, status, url, labels, metadata, synced_at
    ) VALUES (
      ${operation.workspace_id}::uuid,
      ${operation.integration_id}::uuid,
      ${operation.provider},
      ${String(externalId)},
      ${externalKey},
      ${title.slice(0, 500)},
      ${description},
      ${status},
      ${url},
      ${JSON.stringify(labelsValue)}::jsonb,
      ${JSON.stringify({ source: "external_write", operationId: operation.id })}::jsonb,
      now()
    )
    ON CONFLICT (workspace_id, provider, external_id)
    DO UPDATE SET
      integration_id = excluded.integration_id,
      external_key = excluded.external_key,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      url = excluded.url,
      labels = excluded.labels,
      metadata = external_issues.metadata || excluded.metadata,
      synced_at = now(),
      updated_at = now()
    RETURNING id
  `;
  if (!rows[0]?.id) return;
  await sql`
    INSERT INTO requirement_external_links (
      workspace_id, requirement_id, external_issue_id, confidence, source, created_by
    ) VALUES (
      ${operation.workspace_id}::uuid,
      ${operation.requirement_id}::uuid,
      ${rows[0].id}::uuid,
      100,
      ${"user"},
      ${operation.created_by}
    )
    ON CONFLICT (requirement_id, external_issue_id) DO NOTHING
  `;
}

export async function executeExternalWriteOperation(operationId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1 });
  let operation: ExternalOperationRow | null = null;

  try {
    const rows = await sql<ExternalOperationRow[]>`
      SELECT
        o.id, o.workspace_id, o.change_set_id, o.change_proposal_id,
        o.integration_id, o.provider, o.operation_type, o.payload, o.status,
        o.idempotency_key, o.created_by, i.installation_id,
        i.token_ciphertext, i.metadata AS integration_metadata,
        p.requirement_id
      FROM external_write_operations o
      INNER JOIN workspace_integrations i ON i.id = o.integration_id
      LEFT JOIN change_proposals p ON p.id = o.change_proposal_id
      WHERE o.id = ${operationId}::uuid
      LIMIT 1
    `;
    operation = rows[0] || null;
    if (!operation) {
      throw ApplicationFailure.nonRetryable("External write operation not found", "ExternalWriteTerminalError");
    }
    if (operation.status === "succeeded") {
      return { operationId, status: "succeeded" as const, alreadyCompleted: true };
    }
    if (operation.status !== "pending" && operation.status !== "failed_retryable") {
      return { operationId, status: operation.status, skipped: true };
    }

    const claimedRows = await sql<Array<{ id: string }>>`
      UPDATE external_write_operations
      SET status = 'running', attempt_count = attempt_count + 1,
          attempted_at = now(), error = NULL, updated_at = now()
      WHERE id = ${operation.id}::uuid
        AND status IN ('pending', 'failed_retryable')
      RETURNING id
    `;
    if (!claimedRows[0]?.id) {
      const currentRows = await sql<Array<{ status: string }>>`
        SELECT status
        FROM external_write_operations
        WHERE id = ${operation.id}::uuid
        LIMIT 1
      `;
      return { operationId, status: currentRows[0]?.status || "unknown", skipped: true };
    }

    let response: unknown;
    if (operation.provider === "github") {
      response = await runGitHubExternalWrite(operation);
    } else if (operation.provider === "linear") {
      const linear = await runLinearExternalWrite(operation);
      response = linear.result;
      if (linear.refreshedCiphertext) {
        await sql`
          UPDATE workspace_integrations
          SET token_ciphertext = ${linear.refreshedCiphertext}, updated_at = now()
          WHERE id = ${operation.integration_id}::uuid
        `;
      }
    } else {
      throw new Error(`Unsupported external provider: ${operation.provider}`);
    }

    const currentOperation = operation;
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      await upsertExternalIssueFromWrite(
        tx as unknown as SqlExecutor,
        currentOperation,
        response
      );
      await tx`
        UPDATE external_write_operations
        SET status = 'succeeded', response = ${JSON.stringify(response)}::jsonb,
            error = NULL, completed_at = now(), updated_at = now()
        WHERE id = ${currentOperation.id}::uuid
      `;
      await tx`
        UPDATE change_proposals
        SET status = 'applied', applied_at = now()
        WHERE id = ${currentOperation.change_proposal_id}::uuid
      `;
      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${currentOperation.created_by},
          ${currentOperation.workspace_id}::uuid,
          ${"integration.write_succeeded"},
          ${"success"},
          ${JSON.stringify({ operationId, provider: currentOperation.provider, operationType: currentOperation.operation_type })}::jsonb
        )
      `;
    });
    return { operationId, status: "succeeded" as const, alreadyCompleted: false };
  } catch (error) {
    if (!operation) throw error;
    const currentOperation = operation;
    const retryable = externalErrorIsRetryable(error);
    const message = error instanceof Error ? error.message : "External write failed";
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      await tx`
        UPDATE external_write_operations
        SET status = ${retryable ? "failed_retryable" : "failed_terminal"},
            error = ${message}, updated_at = now()
        WHERE id = ${currentOperation.id}::uuid
      `;
      await tx`
        UPDATE change_proposals
        SET status = ${retryable ? "failed_retryable" : "failed_terminal"}
        WHERE id = ${currentOperation.change_proposal_id}::uuid
      `;
      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${currentOperation.created_by},
          ${currentOperation.workspace_id}::uuid,
          ${"integration.write_failed"},
          ${"error"},
          ${JSON.stringify({ operationId, provider: currentOperation.provider, retryable, error: message })}::jsonb
        )
      `;
    });
    if (!retryable) {
      throw ApplicationFailure.nonRetryable(message, "ExternalWriteTerminalError");
    }
    throw error;
  } finally {
    await sql.end();
  }
}

export async function syncGitHubIntegrationAfterExternalWrite(operationId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1 });
  let operation: GitHubSyncOperationRow | null = null;

  try {
    const rows = await sql<GitHubSyncOperationRow[]>`
      SELECT
        o.id, o.workspace_id, o.integration_id, o.provider, o.status,
        i.installation_id, i.metadata AS integration_metadata, i.created_by
      FROM external_write_operations o
      INNER JOIN workspace_integrations i ON i.id = o.integration_id
      WHERE o.id = ${operationId}::uuid
      LIMIT 1
    `;
    operation = rows[0] || null;
    if (!operation || operation.provider !== "github" || operation.status !== "succeeded") {
      return { synced: false as const, skipped: true as const };
    }
    if (!operation.installation_id) {
      throw new Error("GitHub installation is missing");
    }

    const metadata = operation.integration_metadata || {};
    const { owner, repo } = selectedGitHubRepository(metadata);
    const token = await githubInstallationToken(operation.installation_id);
    const { repository, issues, pullRequests } = await fetchGitHubRepositorySyncData(
      token,
      owner,
      repo
    );
    const repositoryOwner = repository.owner?.login || owner;
    const repositoryName = repository.name || repo;
    const fullName = repository.full_name || `${repositoryOwner}/${repositoryName}`;

    const repositoryRows = await sql<Array<{ id: string }>>`
      INSERT INTO workspace_repositories (
        workspace_id, provider, repository_url, repository_owner,
        repository_name, default_branch, created_by
      ) VALUES (
        ${operation.workspace_id}::uuid,
        ${"github"},
        ${repository.html_url || `https://github.com/${fullName}`},
        ${repositoryOwner},
        ${repositoryName},
        ${repository.default_branch || "main"},
        ${operation.created_by}
      )
      ON CONFLICT (workspace_id)
      DO UPDATE SET
        provider = excluded.provider,
        repository_url = excluded.repository_url,
        repository_owner = excluded.repository_owner,
        repository_name = excluded.repository_name,
        default_branch = excluded.default_branch,
        updated_at = now()
      RETURNING id
    `;
    const repositoryId = repositoryRows[0]?.id;

    for (const issue of issues) {
      await sql`
        INSERT INTO external_issues (
          workspace_id, integration_id, provider, external_id, external_key,
          title, description, status, url, labels, metadata, synced_at
        ) VALUES (
          ${operation.workspace_id}::uuid,
          ${operation.integration_id}::uuid,
          ${"github"},
          ${String(issue.id)},
          ${`#${issue.number}`},
          ${(issue.title || `Issue #${issue.number}`).slice(0, 500)},
          ${issue.body || null},
          ${issue.state || "open"},
          ${issue.html_url || null},
          ${JSON.stringify(githubIssueLabels(issue))}::jsonb,
          ${JSON.stringify({
            number: issue.number,
            repository: fullName,
            stale: false,
            syncedFrom: "external_write",
            updatedAt: issue.updated_at || null,
          })}::jsonb,
          now()
        )
        ON CONFLICT (workspace_id, provider, external_id)
        DO UPDATE SET
          integration_id = excluded.integration_id,
          external_key = excluded.external_key,
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          url = excluded.url,
          labels = excluded.labels,
          metadata = external_issues.metadata || excluded.metadata,
          synced_at = now(),
          updated_at = now()
      `;
    }

    const syncedIssues = await sql<Array<{
      id: string;
      external_key: string | null;
      title: string;
      description: string | null;
    }>>`
      SELECT id, external_key, title, description
      FROM external_issues
      WHERE workspace_id = ${operation.workspace_id}::uuid
        AND provider = 'github'
    `;
    const issueReferenceMap = githubIssueReferenceMap(syncedIssues);
    let checkRunCount = 0;

    for (const pullRequest of pullRequests) {
      const references = extractGitHubPullRequestReferences({
        title: pullRequest.title,
        body: pullRequest.body,
        branch: pullRequest.head?.ref || null,
      });
      const linkedExternalIssueIds = [
        ...references.issueNumbers,
        ...references.requirementKeys,
      ]
        .map((reference) => issueReferenceMap.get(reference.toUpperCase()))
        .filter((id): id is string => Boolean(id));
      const uniqueLinkedIssueIds = [...new Set(linkedExternalIssueIds)];
      const status = pullRequest.merged_at
        ? "merged"
        : pullRequest.state || "open";
      const prRows = await sql<Array<{ id: string }>>`
        INSERT INTO external_pull_requests (
          workspace_id, integration_id, repository_id, external_id, number,
          title, status, url, branch, base_branch, latest_commit_sha,
          linked_external_issue_ids, changed_files, metadata, synced_at
        ) VALUES (
          ${operation.workspace_id}::uuid,
          ${operation.integration_id}::uuid,
          ${repositoryId || null}::uuid,
          ${String(pullRequest.id)},
          ${pullRequest.number},
          ${(pullRequest.title || `PR #${pullRequest.number}`).slice(0, 500)},
          ${status},
          ${pullRequest.html_url || null},
          ${pullRequest.head?.ref || null},
          ${pullRequest.base?.ref || null},
          ${pullRequest.head?.sha || null},
          ${JSON.stringify(uniqueLinkedIssueIds)}::jsonb,
          ${JSON.stringify(pullRequest.changedFiles)}::jsonb,
          ${JSON.stringify({
            repository: fullName,
            references,
            syncedFrom: "external_write",
          })}::jsonb,
          now()
        )
        ON CONFLICT (workspace_id, external_id)
        DO UPDATE SET
          integration_id = excluded.integration_id,
          repository_id = excluded.repository_id,
          number = excluded.number,
          title = excluded.title,
          status = excluded.status,
          url = excluded.url,
          branch = excluded.branch,
          base_branch = excluded.base_branch,
          latest_commit_sha = excluded.latest_commit_sha,
          linked_external_issue_ids = excluded.linked_external_issue_ids,
          changed_files = excluded.changed_files,
          metadata = external_pull_requests.metadata || excluded.metadata,
          synced_at = now(),
          updated_at = now()
        RETURNING id
      `;
      const pullRequestId = prRows[0]?.id;
      if (!pullRequestId) continue;

      await sql`
        DELETE FROM external_check_runs
        WHERE pull_request_id = ${pullRequestId}::uuid
      `;
      for (const checkRun of pullRequest.checkRuns) {
        checkRunCount += 1;
        await sql`
          INSERT INTO external_check_runs (
            workspace_id, pull_request_id, external_id, name, status,
            conclusion, url, started_at, completed_at, metadata
          ) VALUES (
            ${operation.workspace_id}::uuid,
            ${pullRequestId}::uuid,
            ${String(checkRun.id)},
            ${(checkRun.name || "GitHub check").slice(0, 255)},
            ${checkRun.status || "unknown"},
            ${checkRun.conclusion || null},
            ${checkRun.html_url || checkRun.details_url || null},
            ${checkRun.started_at ? new Date(checkRun.started_at) : null},
            ${checkRun.completed_at ? new Date(checkRun.completed_at) : null},
            ${JSON.stringify({ repository: fullName, pullRequestNumber: pullRequest.number })}::jsonb
          )
        `;
      }
    }

    const autoLinkedIssues = await autoLinkGitHubRequirements(
      sql as unknown as SqlExecutor,
      operation.workspace_id
    );
    const stats = {
      issues: issues.length,
      pullRequests: pullRequests.length,
      checkRuns: checkRunCount,
      autoLinkedIssues,
    };

    await sql`
      UPDATE workspace_integrations
      SET status = 'connected',
          external_account_name = ${repositoryOwner},
          metadata = metadata || ${JSON.stringify({
            selectedRepository: fullName,
            repositoryOwner,
            repositoryName,
          })}::jsonb,
          last_sync_at = now(),
          last_error = NULL,
          updated_at = now()
      WHERE id = ${operation.integration_id}::uuid
    `;
    await sql`
      INSERT INTO integration_sync_runs (
        workspace_id, integration_id, provider, status, completed_at, stats, metadata
      ) VALUES (
        ${operation.workspace_id}::uuid,
        ${operation.integration_id}::uuid,
        ${"github"},
        ${"completed"},
        now(),
        ${JSON.stringify(stats)}::jsonb,
        ${JSON.stringify({ source: "external_write", operationId, repository: fullName })}::jsonb
      )
    `;
    await sql`
      INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
      VALUES (
        ${operation.created_by},
        ${operation.workspace_id}::uuid,
        ${"integration.github_sync_completed"},
        ${"success"},
        ${JSON.stringify({ operationId, ...stats })}::jsonb
      )
    `;

    return { synced: true as const, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub sync failed";
    if (operation) {
      await recordGitHubSyncFailure(
        sql as unknown as SqlExecutor,
        operation,
        message
      );
      await sql`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${operation.created_by},
          ${operation.workspace_id}::uuid,
          ${"integration.github_sync_failed"},
          ${"error"},
          ${JSON.stringify({ operationId, error: message })}::jsonb
        )
      `;
    }
    return { synced: false as const, error: message };
  } finally {
    await sql.end();
  }
}

export async function listRunnableExternalWriteOperationIds(changeSetId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const rows = await sql<Array<{ id: string }>>`
      SELECT id
      FROM external_write_operations
      WHERE change_set_id = ${changeSetId}::uuid
        AND status IN ('pending', 'failed_retryable')
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map((row) => row.id);
  } finally {
    await sql.end();
  }
}

export async function finalizeExternalWriteOperations(changeSetId: string, userId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<Array<{ status: string; count: number }>>`
      SELECT status, count(*)::int AS count
      FROM external_write_operations
      WHERE change_set_id = ${changeSetId}::uuid
      GROUP BY status
    `;
    const succeeded = rows.find((row) => row.status === "succeeded")?.count || 0;
    const failed = rows
      .filter((row) => row.status === "failed_retryable" || row.status === "failed_terminal")
      .reduce((sum, row) => sum + row.count, 0);
    const remaining = rows
      .filter((row) => row.status === "pending" || row.status === "running")
      .reduce((sum, row) => sum + row.count, 0);
    if (remaining > 0) throw new Error("External operations are not terminal");

    const internalRows = await sql<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM change_proposals
      WHERE change_set_id = ${changeSetId}::uuid
        AND status = 'applied'
        AND action IN ('create_task', 'update_task', 'archive_task', 'relink_task', 'mark_agent_job_outdated')
    `;
    const internalApplied = internalRows[0]?.count || 0;
    const status = resolveExternalChangeSetStatus({ succeeded, failed, internalApplied });
    await sql`
      UPDATE change_sets
      SET status = ${status}, updated_at = now()
      WHERE id = ${changeSetId}::uuid
    `;
    await sql`
      INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
      SELECT
        ${userId}, workspace_id, ${"plan.external_writes_completed"},
        ${failed === 0 ? "success" : "error"},
        ${JSON.stringify({ changeSetId, succeeded, failed, status })}::jsonb
      FROM change_sets WHERE id = ${changeSetId}::uuid
    `;
    return { succeeded, failed, status: status as "applied" | "partially_applied" | "external_failed" };
  } finally {
    await sql.end();
  }
}

export async function rejectPlanChangeSet(
  changeSetId: string,
  userId: string
): Promise<{ rejected: true }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      const rows = await tx<Array<{
        workspace_id: string;
        proposed_version_id: string;
        status: string;
      }>>`
        SELECT workspace_id, proposed_version_id, status
        FROM change_sets
        WHERE id = ${changeSetId}
        FOR UPDATE
      `;
      const changeSet = rows[0];
      if (!changeSet) throw new Error("Change set not found");
      if (changeSet.status !== "pending") throw new Error("Change set is already resolved");

      await tx`
        UPDATE tasks
        SET alignment_status = CASE
              WHEN EXISTS (
                SELECT 1
                FROM requirement_task_links rtl
                INNER JOIN requirements r ON r.id = rtl.requirement_id
                INNER JOIN plan_versions pv ON pv.id = r.plan_version_id
                WHERE rtl.task_id = tasks.id
                  AND pv.status = 'accepted'
              ) THEN 'aligned'
              ELSE 'orphaned'
            END,
            alignment_updated_at = now(),
            updated_at = now()
        WHERE id IN (
          SELECT task_id
          FROM change_proposals
          WHERE change_set_id = ${changeSetId}
            AND task_id IS NOT NULL
        )
      `;
      await tx`
        UPDATE change_proposals
        SET status = 'rejected'
        WHERE change_set_id = ${changeSetId}
          AND status = 'pending'
      `;
      await tx`
        UPDATE plan_versions
        SET status = 'rejected'
        WHERE id = ${changeSet.proposed_version_id}
      `;
      await tx`
        UPDATE change_sets
        SET status = 'rejected',
            resolved_by = ${userId},
            resolved_at = now(),
            updated_at = now()
        WHERE id = ${changeSetId}
      `;
      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${userId},
          ${changeSet.workspace_id},
          ${"plan.change_rejected"},
          ${"success"},
          ${JSON.stringify({ changeSetId })}::jsonb
        )
      `;
    });

    return { rejected: true };
  } finally {
    await sql.end();
  }
}

export async function expirePlanChangeSet(
  changeSetId: string,
  userId: string
): Promise<{ expired: true }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);

  try {
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      const rows = await tx<Array<{
        workspace_id: string;
        proposed_version_id: string;
        status: string;
      }>>`
        SELECT workspace_id, proposed_version_id, status
        FROM change_sets
        WHERE id = ${changeSetId}
        FOR UPDATE
      `;
      const changeSet = rows[0];
      if (!changeSet) throw new Error("Change set not found");
      if (changeSet.status !== "pending") return;

      await tx`
        UPDATE tasks
        SET alignment_status = CASE
              WHEN EXISTS (
                SELECT 1
                FROM requirement_task_links rtl
                INNER JOIN requirements r ON r.id = rtl.requirement_id
                INNER JOIN plan_versions pv ON pv.id = r.plan_version_id
                WHERE rtl.task_id = tasks.id
                  AND pv.status = 'accepted'
              ) THEN 'aligned'
              ELSE 'orphaned'
            END,
            alignment_updated_at = now(),
            updated_at = now()
        WHERE id IN (
          SELECT task_id
          FROM change_proposals
          WHERE change_set_id = ${changeSetId}
            AND task_id IS NOT NULL
        )
      `;
      await tx`
        UPDATE change_proposals
        SET status = 'rejected'
        WHERE change_set_id = ${changeSetId}
          AND status = 'pending'
      `;
      await tx`
        UPDATE plan_versions
        SET status = 'expired'
        WHERE id = ${changeSet.proposed_version_id}
      `;
      await tx`
        UPDATE change_sets
        SET status = 'expired',
            resolved_by = ${userId},
            resolved_at = now(),
            updated_at = now()
        WHERE id = ${changeSetId}
      `;
      await tx`
        INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
        VALUES (
          ${userId},
          ${changeSet.workspace_id},
          ${"plan.change_expired"},
          ${"success"},
          ${JSON.stringify({ changeSetId })}::jsonb
        )
      `;
    });

    return { expired: true };
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
): Promise<Array<{ id: string; title: string; content: string; similarity: number }>> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const results = await searchVectors(query, { limit, workspaceId });
      return results.map((result) => ({
        id: (result.metadata?.docId as string) || result.id,
        title: (result.metadata?.title as string) || "Untitled",
        content: result.content,
        similarity: result.similarity,
      }));
    } catch (error) {
      console.warn("[Activity] Vector search failed; using workspace keyword search:", error);
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl);
  try {
    const rows = await sql<Array<{ id: string; title: string; content: unknown }>>`
      SELECT id, title, content
      FROM docs
      WHERE workspace_id = ${workspaceId}
      ORDER BY updated_at DESC
      LIMIT 30
    `;
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    return rows
      .map((row) => {
        const content = textFromDocumentContent(row.content);
        const haystack = `${row.title} ${content}`.toLowerCase();
        const matches = terms.filter((term) => haystack.includes(term)).length;
        return {
          id: row.id,
          title: row.title,
          content: content.slice(0, 1600),
          similarity: terms.length > 0 ? matches / terms.length : 0,
        };
      })
      .filter((row) => row.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } finally {
    await sql.end();
  }
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
