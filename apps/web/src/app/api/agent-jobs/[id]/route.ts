import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { agentJobs } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { getAgentJobDetail } from "@/lib/agent-handoff";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.id, id) });
  if (!job) return NextResponse.json({ error: "Agent job not found" }, { status: 404 });
  const access = await requireWorkspaceAccess(session.user.id, job.workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json(await getAgentJobDetail(id, job.workspaceId));
}
