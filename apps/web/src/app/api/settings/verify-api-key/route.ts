import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "BYOK_DISABLED",
      message: "User-provided API keys are disabled in v1. AI providers are managed by server secrets.",
    },
    { status: 403 }
  );
}
