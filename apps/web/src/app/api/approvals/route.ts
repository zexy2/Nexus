import { NextResponse } from "next/server";

export const runtime = "nodejs";

const disabledResponse = {
  error: "APPROVALS_API_DISABLED",
  message: "Use DB-backed change sets for plan review approvals.",
};

export async function GET() {
  return NextResponse.json(disabledResponse, { status: 410 });
}

export async function POST() {
  return NextResponse.json(disabledResponse, { status: 410 });
}
