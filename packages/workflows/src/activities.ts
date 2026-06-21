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
  action: "create_task" | "update_task" | "archive_task" | "relink_task";
  requirementStableKey?: string;
  taskId?: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  rationale: string;
  confidence: number;
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
  const documentTitle = deriveDocumentTitle(title, content);

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO docs (workspace_id, title, icon_emoji, content, created_by)
      VALUES (${workspaceId}, ${documentTitle}, ${"✨"}, ${JSON.stringify(blockContent)}::jsonb, ${createdBy})
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

      const stats = {
        added: analysis.requirements.filter((item) => item.changeType === "added").length,
        modified: analysis.requirements.filter((item) => item.changeType === "modified").length,
        unchanged: analysis.requirements.filter((item) => item.changeType === "unchanged").length,
        removed: analysis.requirements.filter((item) => item.changeType === "removed").length,
        proposals: analysis.proposals.length,
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

      for (const proposal of analysis.proposals) {
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
            ${JSON.stringify({ requirementStableKey: proposal.requirementStableKey })}::jsonb
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
): Promise<{ applied: number; rejected: number; createdTaskIds: string[] }> {
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
      }>>`
        SELECT id, requirement_id, task_id, action, title, description, priority, rationale
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

      const selected = selectedProposalIdSet;
      const createdTaskIds: string[] = [];
      let applied = 0;
      let rejected = 0;

      for (const proposal of proposals) {
        if (!selected.has(proposal.id)) {
          await tx`
            UPDATE change_proposals SET status = 'rejected'
            WHERE id = ${proposal.id}
          `;
          rejected++;
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
              ${changeSet.workspace_id},
              ${changeSet.doc_id},
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
            WHERE id = ${taskId}
              AND workspace_id = ${changeSet.workspace_id}
          `;
        } else if (proposal.action === "archive_task" && taskId) {
          await tx`
            UPDATE tasks
            SET is_archived = 1,
                alignment_status = 'aligned',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${taskId}
              AND workspace_id = ${changeSet.workspace_id}
          `;
        } else if (proposal.action === "relink_task" && taskId && proposal.requirement_id) {
          await tx`
            DELETE FROM requirement_task_links rtl
            USING requirements r
            WHERE rtl.requirement_id = r.id
              AND rtl.task_id = ${taskId}
              AND r.plan_version_id = ${changeSet.proposed_version_id}
              AND rtl.requirement_id <> ${proposal.requirement_id}
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
              ${changeSet.workspace_id},
              ${proposal.requirement_id},
              ${taskId},
              ${userId}
            )
            ON CONFLICT (requirement_id, task_id) DO NOTHING
          `;
          await tx`
            UPDATE tasks
            SET doc_id = ${changeSet.doc_id},
                alignment_status = 'aligned',
                alignment_updated_at = now(),
                updated_at = now()
            WHERE id = ${taskId}
          `;
        }

        await tx`
          UPDATE change_proposals
          SET status = 'applied', applied_at = now(), task_id = ${taskId}
          WHERE id = ${proposal.id}
        `;
        await tx`
          INSERT INTO audit_logs (user_id, workspace_id, event, status, metadata)
          VALUES (
            ${userId},
            ${changeSet.workspace_id},
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

      await tx`
        UPDATE plan_versions
        SET status = 'superseded'
        WHERE doc_id = ${changeSet.doc_id}
          AND status = 'accepted'
      `;
      await tx`
        UPDATE plan_versions
        SET status = 'accepted'
        WHERE id = ${changeSet.proposed_version_id}
      `;
      const finalChangeSetStatus = rejected > 0 ? "partially_applied" : "applied";

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
          ${changeSet.workspace_id},
          ${"plan.change_applied"},
              ${"success"},
              ${JSON.stringify({
                changeSetId,
                applied,
                rejected,
                createdTaskIds,
                status: finalChangeSetStatus,
              })}::jsonb
            )
          `;

      const outdatedJobs = await tx<Array<{ id: string }>>`
        UPDATE agent_jobs
        SET status = 'outdated', updated_at = now()
        WHERE workspace_id = ${changeSet.workspace_id}
          AND status IN ('queued', 'claimed', 'running', 'submitted')
          AND task_id IN (
            SELECT id FROM tasks WHERE doc_id = ${changeSet.doc_id}
          )
        RETURNING id
      `;
      for (const job of outdatedJobs) {
        await tx`
          INSERT INTO agent_job_events (job_id, workspace_id, type, message, metadata)
          VALUES (
            ${job.id},
            ${changeSet.workspace_id},
            ${"outdated"},
            ${"The approved plan changed. Refresh the agent brief before review."},
            ${JSON.stringify({ changeSetId })}::jsonb
          )
        `;
      }

      return { applied, rejected, createdTaskIds };
    });
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
