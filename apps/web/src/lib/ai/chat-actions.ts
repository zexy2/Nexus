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
