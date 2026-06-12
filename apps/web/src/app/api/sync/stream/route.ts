import postgres from "postgres";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized, apiError } from "@/lib/api-response";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sync/stream — Server-Sent Events for near-real-time sync.
 *
 * Listens to Postgres NOTIFY (channel `nexus_changes`, emitted by the triggers
 * in scripts/sync-notify.sql) and forwards a "change" event to the client ONLY
 * for workspaces the caller can access. The client reacts by pulling
 * immediately instead of waiting for the 10s poll. Polling remains as a
 * fallback, so this is a pure enhancement.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) return unauthorized();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return apiError(503, "Service Unavailable", "Realtime sync is not configured");
  }

  // Snapshot the caller's accessible workspaces; notifications for any other
  // workspace are dropped (no cross-tenant signal leakage).
  const accessible = new Set(await getAccessibleWorkspaceIds(session.user.id));

  const encoder = new TextEncoder();
  let sql: ReturnType<typeof postgres> | null = null;
  let unlisten: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // controller already closed
        }
      };

      send("ready", JSON.stringify({ ts: Date.now() }));

      sql = postgres(databaseUrl, { max: 1 });
      try {
        const sub = await sql.listen("nexus_changes", (payload) => {
          try {
            const { workspaceId } = JSON.parse(payload);
            if (workspaceId && accessible.has(workspaceId)) {
              send("change", JSON.stringify({ workspaceId }));
            }
          } catch {
            // ignore malformed payloads
          }
        });
        unlisten = sub.unlisten;
      } catch (err) {
        console.error("[sync/stream] LISTEN failed:", err);
        controller.error(err);
        return;
      }

      // Comment-line heartbeat keeps the connection (and proxies) alive.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // closed
        }
      }, 25000);
    },

    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unlisten) await unlisten().catch(() => {});
      if (sql) await sql.end({ timeout: 1 }).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
