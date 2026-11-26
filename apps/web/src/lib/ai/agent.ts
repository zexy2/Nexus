/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Autonomous tool-calling agent.
 *
 * Replaces the old regex orchestration (parse `["research","writer"]` out of a
 * string) with a real agentic loop: the model is given tools (workspace search,
 * web search, document/task creation) and autonomously decides which to call,
 * chains them across steps, observes the results, and synthesizes a final
 * answer. Powered by the AI SDK's multi-step tool calling (stopWhen).
 *
 * All tools are bound to a verified userId + workspaceId, so the agent can only
 * read/write the caller's own workspace.
 */
import { tool, isStepCount } from "ai";
import { z } from "zod";
import { searchWeb } from "@/lib/ai/tavily";
import { getRAGContext } from "@/lib/ai/chat-rag";
import { createDocument, createTask } from "@/lib/ai/chat-actions";
import { isLocalOnly } from "@/lib/ai/providers";
import { generateTextTraced } from "@/lib/ai/traced-generate";
import {
  TASK_ALIGNMENTS,
  TASK_STATUSES,
  loadTaskInsightRows,
  summarizeTasks,
} from "@/lib/ai/task-insights";

interface AgentRunContext {
  userId: string;
  workspaceId: string;
  /**
   * Every workspace the user can read (what the Work board lists). Defaults
   * to [workspaceId].
   */
  readableWorkspaceIds?: string[];
}

interface AgentRunResult {
  text: string;
  toolsUsed: string[];
  createdDocs: { id: string; title: string }[];
  createdTasks: { id: string; title: string }[];
  steps: number;
}

const SUPERVISOR_SYSTEM = `Sen Nexus AI'sın — araçları olan otonom bir asistan.

Kullanıcının isteğini yerine getirmek için araçlarını kullan:
- searchWorkspace: kullanıcının kendi dokümanlarında/görevlerinde ara. Soru kullanıcının içeriğiyle ilgili olabilirse ÖNCE bunu çağır.
- webSearch: güncel/harici bilgi gerektiğinde web'de ara.
- queryTasks: görevlerin canlı verisi (durum, öncelik, plan gereksinimi bağlantısı, Aligned/Needs review/Orphaned rozeti). Görev sayısı, durum, "bağlı değil"/"orphaned"/"yetim" gibi sorularda MUTLAKA bunu kullan; searchWorkspace bu sorulara cevap veremez.
- createDocument: kullanıcı bir doküman/rapor yazmanı VEYA kaydetmeni istediğinde kaydet.
- createTask: kullanıcı görev/yapılacak oluşturmanı istediğinde oluştur.

KURALLAR:
- Araçları gerektiğinde, sırayla zincirleyerek kullan (örn. önce araştır, sonra yaz, sonra kaydet).
- createDocument/createTask'ı SADECE kullanıcı gerçekten bir şey kaydetmek/oluşturmak istediğinde çağır; bilgi sorusuna doğrudan yanıt ver.
- Sonunda doğal, akıcı Türkçe bir yanıt ver. Gereksiz emoji/aşırı formatlama yapma.`;

/**
 * Run the autonomous agent for one user turn. Returns the synthesized text plus
 * a record of what the agent actually did (tools used, entities created).
 */
export async function runAgent(opts: {
  model: any;
  messages: Array<{ role: string; content: string }>;
  context: AgentRunContext;
  maxSteps?: number;
  /** Trace labels for the admin traces page (defaults to "agent.run"). */
  trace?: { name?: string; modelName?: string; provider?: string };
}): Promise<AgentRunResult> {
  const { model, messages, context, maxSteps = 6, trace } = opts;

  const toolsUsed: string[] = [];
  const createdDocs: { id: string; title: string }[] = [];
  const createdTasks: { id: string; title: string }[] = [];

  const tools = {
    searchWorkspace: tool({
      description:
        "Search the user's own workspace documents and tasks for relevant context. Use when the question may relate to the user's content.",
      inputSchema: z.object({
        query: z.string().describe("What to look for in the workspace"),
      }),
      execute: async ({ query }: { query: string }) => {
        toolsUsed.push("searchWorkspace");
        const ctx = await getRAGContext(query, context.workspaceId);
        return ctx || "No relevant workspace content was found.";
      },
    }),

    queryTasks: tool({
      description:
        "Read live task rows from the user's Work board: status, priority, alignment badge (aligned | needs_review | orphaned) and linked accepted plan requirements, plus totals. Use for any question about which/how many tasks are orphaned, unlinked, linked to a requirement, or in a given status.",
      inputSchema: z.object({
        alignment: z
          .enum(TASK_ALIGNMENTS)
          .optional()
          .describe("Filter by board badge; 'orphaned' is shown as Orphaned (not linked to the plan)."),
        linked: z
          .boolean()
          .optional()
          .describe("true: linked to at least one accepted plan requirement; false: linked to none."),
        status: z.enum(TASK_STATUSES).optional().describe("Filter by board column"),
        query: z.string().optional().describe("Case-insensitive title substring"),
      }),
      execute: async (filter: {
        alignment?: (typeof TASK_ALIGNMENTS)[number];
        linked?: boolean;
        status?: (typeof TASK_STATUSES)[number];
        query?: string;
      }) => {
        toolsUsed.push("queryTasks");
        const rows = await loadTaskInsightRows(
          context.readableWorkspaceIds?.length ? context.readableWorkspaceIds : [context.workspaceId]
        );
        return summarizeTasks(rows, filter);
      },
    }),

    webSearch: tool({
      description: "Search the web for current or external information.",
      inputSchema: z.object({
        query: z.string().describe("The web search query"),
      }),
      execute: async ({ query }: { query: string }) => {
        toolsUsed.push("webSearch");
        try {
          const result = await searchWeb(query, { maxResults: 5, includeAnswer: true });
          const sources = result.results
            .slice(0, 5)
            .map((r) => `- ${r.title}: ${r.url}`)
            .join("\n");
          return `${result.answer || ""}\n\nSources:\n${sources}`.trim();
        } catch {
          return "Web search is unavailable right now.";
        }
      },
    }),

    createDocument: tool({
      description:
        "Save a document to the user's workspace. Use when the user asks to write or save a document/report.",
      inputSchema: z.object({
        title: z.string().describe("Document title"),
        content: z.string().describe("Document body in Markdown"),
      }),
      execute: async ({ title, content }: { title: string; content: string }) => {
        toolsUsed.push("createDocument");
        const res = await createDocument(context.userId, title, content);
        if (res.success) {
          createdDocs.push({ id: res.id, title: res.title });
          return `Saved document "${res.title}" (id: ${res.id}).`;
        }
        return "Failed to save the document.";
      },
    }),

    createTask: tool({
      description: "Create a task in the user's workspace.",
      inputSchema: z.object({
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Optional task description"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }),
      execute: async ({
        title,
        description,
        priority,
      }: {
        title: string;
        description?: string;
        priority?: "low" | "medium" | "high" | "urgent";
      }) => {
        toolsUsed.push("createTask");
        const res = await createTask(context.userId, title, description || "", priority || "medium");
        if (res.success) {
          createdTasks.push({ id: res.id, title: res.title });
          return `Created task "${res.title}" (id: ${res.id}).`;
        }
        return "Failed to create the task.";
      },
    }),
  };

  // In privacy mode, drop web search — it would send the query to an external
  // service. Everything else (workspace, doc/task) stays local.
  const activeTools = isLocalOnly()
    ? {
        searchWorkspace: tools.searchWorkspace,
        queryTasks: tools.queryTasks,
        createDocument: tools.createDocument,
        createTask: tools.createTask,
      }
    : tools;

  const result = await generateTextTraced(
    {
      model,
      instructions: SUPERVISOR_SYSTEM,
      messages: messages as any,
      tools: activeTools,
      stopWhen: isStepCount(maxSteps),
    },
    {
      name: trace?.name ?? "agent.run",
      agentType: "agent",
      userId: context.userId,
      workspaceId: context.workspaceId,
      modelName: trace?.modelName,
      provider: trace?.provider,
    }
  );

  return {
    text: result.text,
    toolsUsed: Array.from(new Set(toolsUsed)),
    createdDocs,
    createdTasks,
    steps: result.steps?.length ?? 1,
  };
}
