/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chat side-effects: persisting AI output as documents/tasks.
 *
 * All writes are attributed to an explicit, session-verified userId — there is
 * deliberately no "current user" lookup here so a missing session can never
 * fall back to writing as another user.
 */
import { db } from "@/lib/db";
import { docs, tasks } from "@nexus/database/schema";
import { ensureDefaultWorkspace } from "@/lib/workspace-auth";
import { AGENTS } from "@/lib/ai/chat-agents";

// Create document in database
export async function createDocument(userId: string, title: string, content: string) {
  const workspaceId = (await ensureDefaultWorkspace(userId)).id;

  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  const blockContent = paragraphs.map((text, index) => {
    const isHeading = /^#{1,3}\s/.test(text) || /^\*\*[^*]+\*\*$/.test(text.trim());
    const cleanText = text.replace(/^#{1,3}\s/, '').replace(/^\*\*|\*\*$/g, '');

    return {
      id: `block-${index + 1}`,
      type: isHeading ? "heading" : "paragraph",
      props: isHeading
        ? { level: 2, textColor: "default", backgroundColor: "default", textAlignment: "left" }
        : { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [{ type: "text", text: cleanText.trim(), styles: {} }],
      children: []
    };
  });

  const [doc] = await db.insert(docs).values({
    workspaceId,
    title,
    content: blockContent as any,
    createdBy: userId
  }).returning();

  return { success: true as const, id: doc.id, title };
}

// Create task in database
export async function createTask(userId: string, title: string, description: string, priority: string = "medium") {
  const workspaceId = (await ensureDefaultWorkspace(userId)).id;

  const [task] = await db.insert(tasks).values({
    workspaceId,
    title,
    description,
    status: "todo",
    priority: priority as any,
    assigneeId: userId,
    createdBy: userId
  }).returning();

  return { success: true as const, id: task.id, title };
}

const TASK_KEYWORDS = ['task', 'görev', 'yapılacak', 'todo', 'plan'];
const DOC_KEYWORDS = ['document', 'doküman', 'belge', 'rapor', 'report', 'write', 'yaz'];

/**
 * Auto-save tasks/documents extracted from agent output when the user's
 * message asked for them. Shared by the LangGraph path and the manual
 * supervisor fallback (previously duplicated in both).
 *
 * Returns the final response augmented with save confirmations.
 */
export async function applyAutoSave(options: {
  userId: string;
  userMessage: string;
  agentsUsed: string[];
  finalResponse: string;
  /** Text to extract task bullets from (defaults to the final response). */
  taskSource?: string;
  /** Text to save as the document body (defaults to the final response). */
  docSource?: string;
  /** Confirmation block separator ("\n\n" for LangGraph path, "\n" for fallback). */
  separator?: "\n\n" | "\n";
}): Promise<string> {
  const {
    userId,
    userMessage,
    agentsUsed,
    taskSource,
    docSource,
    separator = "\n\n",
  } = options;
  let finalResponse = options.finalResponse;

  const userMessageLower = userMessage.toLowerCase();
  const shouldCreateTask =
    agentsUsed.includes("task") && TASK_KEYWORDS.some(k => userMessageLower.includes(k));
  const shouldCreateDoc =
    agentsUsed.includes("writer") && DOC_KEYWORDS.some(k => userMessageLower.includes(k));

  if (shouldCreateTask) {
    const source = taskSource ?? finalResponse;
    const taskLines = source.split('\n').filter(line =>
      line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/)
    );

    if (taskLines.length > 0) {
      finalResponse += `${separator}✅ **Tasks Created:**\n`;
      for (const line of taskLines.slice(0, 5)) {
        const title = line.replace(/^[-*•\d.]\s*/, '').trim();
        if (title.length > 3) {
          const result = await createTask(userId, title, "", "medium");
          if (result.success) {
            finalResponse += `- ${title}\n`;
          }
        }
      }
      finalResponse += `\nView them in the Tasks section.`;
    }
  }

  if (shouldCreateDoc) {
    const source = docSource ?? finalResponse;
    const titleMatch = source.match(/^#\s*(.+)$/m) || source.match(/^\*\*(.+)\*\*$/m);
    const title = titleMatch ? titleMatch[1] : `Document: ${userMessage.substring(0, 50)}`;

    const result = await createDocument(userId, title, source);
    if (result.success) {
      finalResponse += `${separator}📄 **Document saved:** ${result.title}\n\nView it in the Documents section.`;
    }
  }

  return finalResponse;
}

export { AGENTS };
