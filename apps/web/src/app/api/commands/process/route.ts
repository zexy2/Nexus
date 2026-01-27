import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const runtime = "nodejs";

// In-memory store for command status (in production, use Redis or database)
const commandStatusStore = new Map<string, {
  status: "processing" | "completed" | "failed";
  result?: {
    agentsUsed: string[];
    documentsCreated: string[];
    tasksCreated: string[];
    output: string;
    duration: number;
  };
  error?: string;
  startedAt: number;
}>();

/**
 * POST /api/commands/process
 * Process a natural language command via Supervisor Agent
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { commandId, command, workspaceId, priority, metadata } = body;

    if (!commandId || !command) {
      return NextResponse.json(
        { error: "commandId and command are required" },
        { status: 400 }
      );
    }

    // Store initial status
    commandStatusStore.set(commandId, {
      status: "processing",
      startedAt: Date.now(),
    });

    // Process command asynchronously
    processCommandAsync(commandId, command, workspaceId, session.user.id, priority, metadata);

    return NextResponse.json({ 
      success: true, 
      commandId,
      message: "Command processing started" 
    });

  } catch (error) {
    console.error("Command process error:", error);
    return NextResponse.json(
      { error: "Failed to process command" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/commands/status?id=xxx
 * Get status of a command
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const commandId = searchParams.get("id");

    if (!commandId) {
      return NextResponse.json(
        { error: "id parameter is required" },
        { status: 400 }
      );
    }

    const status = commandStatusStore.get(commandId);
    
    if (!status) {
      return NextResponse.json(
        { error: "Command not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(status);

  } catch (error) {
    console.error("Command status error:", error);
    return NextResponse.json(
      { error: "Failed to get command status" },
      { status: 500 }
    );
  }
}

/**
 * Process command asynchronously using LangGraph Supervisor
 */
async function processCommandAsync(
  commandId: string,
  command: string,
  workspaceId: string,
  userId: string,
  priority?: string,
  metadata?: Record<string, unknown>
) {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Processing command ${commandId}: "${command.substring(0, 50)}..."`);

    // Dynamically import LangGraph components
    let createSupervisor: typeof import("@nexus/agents").createSupervisor | null = null;
    let HumanMessage: typeof import("@langchain/core/messages").HumanMessage | null = null;
    
    try {
      const agentsModule = await import("@nexus/agents");
      const messagesModule = await import("@langchain/core/messages");
      createSupervisor = agentsModule.createSupervisor;
      HumanMessage = messagesModule.HumanMessage;
    } catch (e) {
      console.warn("LangGraph not available, using fallback:", e);
    }

    // Initialize result tracking
    const documentsCreated: string[] = [];
    const tasksCreated: string[] = [];
    let output = "";
    let agentsUsed: string[] = [];

    if (createSupervisor && HumanMessage && process.env.GEMINI_API_KEY) {
      // Use LangGraph Supervisor
      const supervisor = createSupervisor({
        provider: "gemini",
        model: "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY,
      });

      const initialState = {
        messages: [new HumanMessage(command)],
        currentAgent: null,
        agentResults: {},
        plan: [],
        completed: [],
        context: {
          workspaceId,
          userId,
          sessionId: `cmd-${commandId}`,
        },
        finalOutput: undefined,
      };

      const result = await supervisor.invoke(initialState);
      
      agentsUsed = result.completed || [];
      output = result.finalOutput || 
        Object.values(result.agentResults || {})
          .map((r: any) => r.output)
          .join("\n\n") ||
        "Command processed successfully.";

      // Check if documents or tasks were created
      if (result.agentResults) {
        for (const [agentName, agentResult] of Object.entries(result.agentResults)) {
          const res = agentResult as any;
          if (res.documentId) documentsCreated.push(res.documentId);
          if (res.taskIds) tasksCreated.push(...res.taskIds);
        }
      }

    } else {
      // Fallback: Use simple Gemini call
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `Process this command and provide a helpful response: "${command}"` }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        output = data.candidates?.[0]?.content?.parts?.[0]?.text || "Command processed.";
        agentsUsed = ["gemini-direct"];
      } else {
        throw new Error("Gemini API error");
      }
    }

    const duration = Date.now() - startTime;

    // Update status to completed
    commandStatusStore.set(commandId, {
      status: "completed",
      result: {
        agentsUsed,
        documentsCreated,
        tasksCreated,
        output,
        duration,
      },
      startedAt: startTime,
    });

    console.log(`✅ Command ${commandId} completed in ${duration}ms. Agents: ${agentsUsed.join(", ")}`);

    // Cleanup old entries after 1 hour
    setTimeout(() => {
      commandStatusStore.delete(commandId);
    }, 3600000);

  } catch (error) {
    console.error(`❌ Command ${commandId} failed:`, error);
    
    commandStatusStore.set(commandId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      startedAt: startTime,
    });
  }
}
