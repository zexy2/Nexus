import { verifySession } from "@/lib/api-middleware";
import { unauthorized, apiError } from "@/lib/api-response";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";
import { subscribeToChanges } from "@/lib/realtime-change-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sync/stream — Server-Sent Events for near-real-time sync.
 *
 * Listens to Postgres NOTIFY (channel `nexus_changes`, emitted by the triggers
 * installed by the database migrations) and forwards a "change" event to the client ONLY
 * for workspaces the caller can access. The client reacts by pulling
 * immediately instead of waiting for the 10s poll. Polling remains as a
 * fallback, so this is a pure enhancement.
 *
 * All streams in this process share ONE Postgres LISTEN connection
 * (lib/realtime-change-feed) with in-memory fan-out, instead of one
 * connection per connected client.
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
  let unsubscribe: (() => Promise<void>) | null = null;
  let cancelled = false;
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

      try {
        const stop = await subscribeToChanges(databaseUrl, ({ workspaceId }) => {
          if (accessible.has(workspaceId)) {
            send("change", JSON.stringify({ workspaceId }));
          }
        });
        if (cancelled) {
          await stop();
          return;
        }
        unsubscribe = stop;
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
          // Stream closed without cancel(): release the shared subscription.
          if (heartbeat) clearInterval(heartbeat);
          cancelled = true;
          void unsubscribe?.().catch(() => {});
        }
      }, 25000);
    },

    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cancelled = true;
      if (unsubscribe) await unsubscribe().catch(() => {});
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
