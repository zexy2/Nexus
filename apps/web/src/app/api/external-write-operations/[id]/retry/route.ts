import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { externalWriteOperations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner } from "@/lib/workspace-auth";
import { performExternalWriteOperation } from "@/lib/integrations/external-writes";
import { IntegrationSyncError } from "@/lib/integrations/sync";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const operation = await db.query.externalWriteOperations.findFirst({
    where: eq(externalWriteOperations.id, id),
  });
  if (!operation) {
    return NextResponse.json({ error: "External write operation not found" }, { status: 404 });
  }

  const access = await requireWorkspaceOwner(session.user.id, operation.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await performExternalWriteOperation(operation.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof IntegrationSyncError) {
      return NextResponse.json(
        { error: error.code, message: error.message, metadata: error.metadata },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "PROVIDER_API_FAILED", message: error instanceof Error ? error.message : "External write failed." },
      { status: 502 }
    );
  }
}
