import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

interface VerifyRequest {
  provider: "gemini" | "openai" | "anthropic" | "groq";
  apiKey: string;
}

// Helper to extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// Helper to check for status property
function hasStatus(error: unknown): error is { status: number } {
  return typeof error === "object" && error !== null && "status" in error;
}

// POST /api/settings/verify-api-key - Verify API key
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: VerifyRequest = await request.json();
    const { provider, apiKey } = body;

    if (!apiKey || !provider) {
      return NextResponse.json(
        { error: "Provider and API key are required" },
        { status: 400 }
      );
    }

    if (provider === "gemini") {
      // Verify Gemini API key
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (response.ok) {
          return NextResponse.json({ 
            valid: true, 
            provider: "gemini",
            message: "Google AI API key is valid" 
          });
        } else {
          const error = await response.json();
          return NextResponse.json({ 
            valid: false, 
            provider: "gemini",
            message: error.error?.message || "Invalid Google AI API key" 
          });
        }
      } catch (error: unknown) {
        return NextResponse.json({ 
          valid: false, 
          provider: "gemini",
          message: getErrorMessage(error) || "Invalid Google AI API key" 
        });
      }
    } else if (provider === "openai") {
      // Verify OpenAI API key
      try {
        const openai = new OpenAI({ apiKey });
        // Make a simple models list call to verify the key
        await openai.models.list();
        return NextResponse.json({ 
          valid: true, 
          provider: "openai",
          message: "OpenAI API key is valid" 
        });
      } catch (error: unknown) {
        return NextResponse.json({ 
          valid: false, 
          provider: "openai",
          message: getErrorMessage(error) || "Invalid OpenAI API key" 
        });
      }
    } else if (provider === "anthropic") {
      // Verify Anthropic API key
      try {
        const anthropic = new Anthropic({ apiKey });
        // Make a simple message call to verify the key
        await anthropic.messages.create({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        });
        return NextResponse.json({ 
          valid: true, 
          provider: "anthropic",
          message: "Anthropic API key is valid" 
        });
      } catch (error: unknown) {
        // Anthropic throws error for invalid key, but we can catch it
        if (hasStatus(error) && error.status === 401) {
          return NextResponse.json({ 
            valid: false, 
            provider: "anthropic",
            message: "Invalid Anthropic API key" 
          });
        }
        // If it's a different error (like rate limit), the key might still be valid
        return NextResponse.json({ 
          valid: true, 
          provider: "anthropic",
          message: "Anthropic API key appears valid" 
        });
      }
    } else if (provider === "groq") {
      // Verify Groq API key
      try {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          return NextResponse.json({ 
            valid: true, 
            provider: "groq",
            message: "Groq API key is valid" 
          });
        } else {
          return NextResponse.json({ 
            valid: false, 
            provider: "groq",
            message: "Invalid Groq API key" 
          });
        }
      } catch (error: unknown) {
        return NextResponse.json({ 
          valid: false, 
          provider: "groq",
          message: getErrorMessage(error) || "Invalid Groq API key" 
        });
      }
    } else {
      return NextResponse.json(
        { error: "Invalid provider. Use 'gemini', 'openai', 'anthropic', or 'groq'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error verifying API key:", error);
    return NextResponse.json(
      { error: "Failed to verify API key" },
      { status: 500 }
    );
  }
}
