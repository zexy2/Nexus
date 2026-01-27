import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Re-export GET from process route for status checking
export { GET } from "../process/route";
