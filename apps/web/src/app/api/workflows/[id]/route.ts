import { NextRequest } from "next/server";
import { GET as getWorkflow } from "../route";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.searchParams.set("workflowId", id);

  return getWorkflow(
    new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    })
  );
}
