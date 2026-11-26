/**
 * What the Ask Nexus agent did for one reply (tools, steps, created entities).
 *
 * POST /api/chat returns the answer as plain text and this record in the
 * `X-Nexus-Agent` header (URI-encoded JSON, so non-ASCII titles survive the
 * header's Latin-1 limit). Shared by the route and the chat client.
 */
export const AGENT_META_HEADER = "X-Nexus-Agent";

export interface AgentMeta {
  toolsUsed: string[];
  steps: number;
  createdDocs: { id: string; title: string }[];
  createdTasks: { id: string; title: string }[];
}

export function encodeAgentMeta(meta: AgentMeta): string {
  return encodeURIComponent(JSON.stringify(meta));
}

export function decodeAgentMeta(value: string | null | undefined): AgentMeta | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== "object") return undefined;
    const list = (v: unknown) =>
      Array.isArray(v)
        ? v.filter(
            (item): item is { id: string; title: string } =>
              !!item && typeof item.id === "string" && typeof item.title === "string"
          )
        : [];
    return {
      toolsUsed: Array.isArray(parsed.toolsUsed)
        ? parsed.toolsUsed.filter((t: unknown): t is string => typeof t === "string")
        : [],
      steps: typeof parsed.steps === "number" ? parsed.steps : 0,
      createdDocs: list(parsed.createdDocs),
      createdTasks: list(parsed.createdTasks),
    };
  } catch {
    return undefined;
  }
}
